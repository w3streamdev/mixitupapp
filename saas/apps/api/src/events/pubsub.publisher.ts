import type { OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Injectable, Logger } from "@nestjs/common";

interface PubSubMessage {
  topic: string;
  data: Record<string, unknown>;
  attributes?: Record<string, string> | undefined;
}

interface TopicHandle {
  publishMessage(msg: { data: Buffer; attributes?: Record<string, string> }): Promise<string>;
}

interface PubSubClient {
  topic(name: string): TopicHandle;
  close(): Promise<void>;
}

@Injectable()
export class PubSubPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PubSubPublisher.name);
  private client: PubSubClient | null = null;
  private projectId = "";

  async onModuleInit(): Promise<void> {
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT ?? "";
    if (!this.projectId) {
      this.logger.warn("GOOGLE_CLOUD_PROJECT not set — Pub/Sub publishing disabled");
      return;
    }

    try {
      // Dynamic import to avoid hard dependency when running locally
      const mod = await import("@google-cloud/pubsub" as string);
      const PubSub = mod.PubSub ?? mod.default?.PubSub;
      this.client = new PubSub({ projectId: this.projectId }) as PubSubClient;
      this.logger.log(`Pub/Sub publisher initialized for project ${this.projectId}`);
    } catch {
      this.logger.warn("@google-cloud/pubsub not available — publishing disabled");
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }

  async publish(message: PubSubMessage): Promise<string | null> {
    if (!this.client) {
      this.logger.warn(`Pub/Sub not connected — dropping message to topic ${message.topic}`);
      this.logger.debug("Message data:", message.data);
      return null;
    }

    const topic = this.client.topic(message.topic);
    const data = Buffer.from(JSON.stringify(message.data));
    const publishMsg: { data: Buffer; attributes?: Record<string, string> } = { data };
    if (message.attributes) {
      publishMsg.attributes = message.attributes;
    }
    const messageId = await topic.publishMessage(publishMsg);

    this.logger.log(`Published message ${messageId} to topic ${message.topic}`);
    return messageId;
  }

  async publishCommandRun(
    tenantId: string,
    commandId: string,
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    return this.publish({
      topic: "command-runs",
      data: { tenantId, commandId, payload, timestamp: new Date().toISOString() },
      attributes: { tenantId, commandId, type: "command.run" },
    });
  }

  async publishWebhook(
    tenantId: string,
    webhookId: string,
    event: string,
    data: Record<string, unknown>,
  ): Promise<string | null> {
    return this.publish({
      topic: "webhook-deliveries",
      data: { tenantId, webhookId, event, data, timestamp: new Date().toISOString() },
      attributes: { tenantId, webhookId, event },
    });
  }

  async publishAuditEvent(
    tenantId: string,
    action: string,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    return this.publish({
      topic: "audit-events",
      data: { tenantId, action, entityType, entityId, payload, timestamp: new Date().toISOString() },
      attributes: { tenantId, action },
    });
  }
}
