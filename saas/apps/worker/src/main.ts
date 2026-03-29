import { PrismaClient } from "@prisma/client";
import { CommandRunHandler } from "./handlers/command-run.handler.js";
import { WebhookDeliveryHandler } from "./handlers/webhook-delivery.handler.js";
import { AuditEventHandler } from "./handlers/audit-event.handler.js";
import { PubSubSubscriber } from "./pubsub-subscriber.js";

const logger = {
  log: (msg: string) => console.log(`[Worker] ${new Date().toISOString()} ${msg}`),
  error: (msg: string, err?: unknown) =>
    console.error(`[Worker] ${new Date().toISOString()} ERROR: ${msg}`, err),
};

async function main(): Promise<void> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    logger.log("GOOGLE_CLOUD_PROJECT not set — running in local/dev mode");
    logger.log("Worker standing by. In production, it will consume Pub/Sub messages.");
    // Keep process alive for Cloud Run
    await new Promise(() => {});
    return;
  }

  const prisma = new PrismaClient();
  await prisma.$connect();
  logger.log("Prisma connected");

  const commandHandler = new CommandRunHandler(prisma);
  const webhookHandler = new WebhookDeliveryHandler(prisma);
  const auditHandler = new AuditEventHandler(prisma);

  const subscriber = new PubSubSubscriber(projectId);

  subscriber.subscribe("command-runs-sub", async (data) => {
    await commandHandler.handle(data);
  });

  subscriber.subscribe("webhook-deliveries-sub", async (data) => {
    await webhookHandler.handle(data);
  });

  subscriber.subscribe("audit-events-sub", async (data) => {
    await auditHandler.handle(data);
  });

  logger.log("Worker subscriptions active");

  // Graceful shutdown
  const shutdown = async () => {
    logger.log("Shutting down...");
    await subscriber.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

main().catch((err) => {
  logger.error("Worker failed to start", err);
  process.exit(1);
});
