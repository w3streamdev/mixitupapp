import type { OnModuleInit } from "@nestjs/common";
import { Injectable, Logger } from "@nestjs/common";

interface TaskPayload {
  queue: string;
  url: string;
  body: Record<string, unknown>;
  scheduleTime?: Date | undefined;
  headers?: Record<string, string> | undefined;
}

@Injectable()
export class CloudTasksService implements OnModuleInit {
  private readonly logger = new Logger(CloudTasksService.name);
  private projectId = "";
  private location = "";
  private serviceUrl = "";
  private enabled = false;

  onModuleInit(): void {
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT ?? "";
    this.location = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
    this.serviceUrl = process.env.CLOUD_TASKS_SERVICE_URL ?? "";
    this.enabled = Boolean(this.projectId && this.serviceUrl);

    if (!this.enabled) {
      this.logger.warn("Cloud Tasks not configured — task scheduling disabled");
    } else {
      this.logger.log(`Cloud Tasks ready: project=${this.projectId}, location=${this.location}`);
    }
  }

  async enqueue(task: TaskPayload): Promise<string | null> {
    if (!this.enabled) {
      this.logger.warn(`Cloud Tasks disabled — dropping task for queue ${task.queue}`);
      this.logger.debug("Task payload:", task.body);
      return null;
    }

    try {
      // Dynamic import for GCP SDK
      const mod = await import("@google-cloud/tasks" as string);
      const CloudTasksClient = mod.CloudTasksClient ?? mod.default?.CloudTasksClient;
      const client = new CloudTasksClient();

      const parent = client.queuePath(this.projectId, this.location, task.queue);
      const fullUrl = `${this.serviceUrl}${task.url}`;

      const taskDef: Record<string, unknown> = {
        httpRequest: {
          httpMethod: "POST",
          url: fullUrl,
          headers: {
            "Content-Type": "application/json",
            ...task.headers,
          },
          body: Buffer.from(JSON.stringify(task.body)).toString("base64"),
        },
      };

      if (task.scheduleTime) {
        taskDef.scheduleTime = { seconds: Math.floor(task.scheduleTime.getTime() / 1000) };
      }

      const [response] = await client.createTask({ parent, task: taskDef });
      const taskName = String(response.name ?? "unknown");
      this.logger.log(`Enqueued task ${taskName} to queue ${task.queue}`);
      return taskName;
    } catch (err) {
      this.logger.error(
        `Failed to enqueue task to ${task.queue}: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
      throw err;
    }
  }

  async enqueueCommandRun(
    tenantId: string,
    commandId: string,
    payload: Record<string, unknown>,
    delay?: Date,
  ): Promise<string | null> {
    return this.enqueue({
      queue: "command-runs",
      url: "/internal/tasks/commands/run",
      body: { tenantId, commandId, payload },
      scheduleTime: delay,
    });
  }

  async enqueueWebhookDelivery(
    tenantId: string,
    webhookId: string,
    event: string,
    data: Record<string, unknown>,
    delay?: Date,
  ): Promise<string | null> {
    return this.enqueue({
      queue: "webhook-deliveries",
      url: "/internal/tasks/webhooks/deliver",
      body: { tenantId, webhookId, event, data },
      scheduleTime: delay,
    });
  }
}
