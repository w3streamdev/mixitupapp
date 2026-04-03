import * as http from "node:http";
import { PrismaClient } from "@prisma/client";
import { CommandRunHandler } from "./handlers/command-run.handler.js";
import { WebhookDeliveryHandler } from "./handlers/webhook-delivery.handler.js";
import { AuditEventHandler } from "./handlers/audit-event.handler.js";
import { PubSubSubscriber } from "./pubsub-subscriber.js";

// Engine imports
import { CommandEngine } from "./engine/command-engine.js";
import { ExecutorRegistry } from "./engine/executor-registry.js";
import { ChatActionExecutor } from "./engine/executors/chat-action.executor.js";
import { WaitActionExecutor } from "./engine/executors/wait-action.executor.js";
import { CounterActionExecutor } from "./engine/executors/counter-action.executor.js";
import { CurrencyActionExecutor } from "./engine/executors/currency-action.executor.js";
import { ConditionalActionExecutor } from "./engine/executors/conditional-action.executor.js";
import { CommandRefActionExecutor } from "./engine/executors/command-ref-action.executor.js";
import { WebRequestActionExecutor } from "./engine/executors/web-request-action.executor.js";
import { PlatformChatService } from "./services/platform-chat.service.js";
import { TimerScheduler } from "./services/timer-scheduler.js";
import { TwitchChatService } from "./services/twitch-chat.service.js";

// Services
import { createRedisClient } from "./services/redis-client.js";
import { CooldownService } from "./services/cooldown.service.js";
import { CommandLockService } from "./services/command-lock.service.js";
import type { LockMode } from "./services/command-lock.service.js";

const logger = {
  log: (msg: string) => console.log(`[Worker] ${new Date().toISOString()} ${msg}`),
  error: (msg: string, err?: unknown) =>
    console.error(`[Worker] ${new Date().toISOString()} ERROR: ${msg}`, err),
};

function startHealthServer(): void {
  const port = Number(process.env.PORT ?? 8080);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "worker" }));
  });
  server.listen(port, "0.0.0.0", () => {
    logger.log(`Health server listening on port ${port}`);
  });
}

function buildCommandEngine(
  prisma: PrismaClient,
  cooldownService: CooldownService,
  lockService: CommandLockService,
  sendMessageFn: (channel: string, platform: string, message: string, tenantId: string) => Promise<void>,
): CommandEngine {
  const registry = new ExecutorRegistry();

  const lockMode = (process.env.COMMAND_LOCK_MODE as LockMode) ?? "none";

  const engineRef: { current: CommandEngine | null } = { current: null };

  const executeActionsFn = async (
    actions: Parameters<CommandEngine["executeActions"]>[0],
    context: Parameters<CommandEngine["executeActions"]>[1],
  ) => engineRef.current!.executeActions(actions, context);

  registry.register(new ChatActionExecutor(sendMessageFn));
  registry.register(new WaitActionExecutor());
  registry.register(new CounterActionExecutor(prisma));
  registry.register(new CurrencyActionExecutor(prisma));
  registry.register(new ConditionalActionExecutor(prisma, executeActionsFn));
  registry.register(new CommandRefActionExecutor(prisma, executeActionsFn));
  registry.register(new WebRequestActionExecutor());

  const engine = new CommandEngine(prisma, registry, {
    cooldownService,
    lockService,
    lockMode,
  });
  engineRef.current = engine;
  return engine;
}

async function main(): Promise<void> {
  startHealthServer();

  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    logger.log("GOOGLE_CLOUD_PROJECT not set — running in local/dev mode");
    logger.log("Worker standing by. In production, it will consume Pub/Sub messages.");
    return;
  }

  const prisma = new PrismaClient();
  await prisma.$connect();
  logger.log("Prisma connected");

  const redis = createRedisClient();
  const cooldownService = new CooldownService(redis);
  const lockService = new CommandLockService(redis);

  // TwitchChatService placeholder — will be set after engine is built
  const twitchChatRef: { current: TwitchChatService | null } = { current: null };

  const sendMessageFn = async (channel: string, platform: string, message: string, tenantId: string) => {
    if (platform === "twitch" && twitchChatRef.current?.isConnected()) {
      await twitchChatRef.current.sendMessage(channel, message);
    } else {
      // Fallback to API-based sending
      const fallback = new PlatformChatService(prisma);
      await fallback.sendMessage(tenantId, platform, message);
    }
  };

  const engine = buildCommandEngine(prisma, cooldownService, lockService, sendMessageFn);

  // Twitch IRC chat is handled by the external chat-bridge process
  // (Cloud Run's networking kills WebSocket IRC connections)
  const twitchChat = { stop: async () => {} } as { stop: () => Promise<void> };

  const commandHandler = new CommandRunHandler(prisma, engine);
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

  // Start timer scheduler for timer-type commands
  const timerScheduler = new TimerScheduler(prisma, async (tenantId, commandId) => {
    const executionId = `timer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    logger.log(`Timer fired: tenant=${tenantId} command=${commandId} execution=${executionId}`);
    await engine.executeCommand({
      tenantId,
      commandId,
      executionId,
      triggerType: "timer",
      platform: "system",
      userId: "",
      username: "",
      displayName: "",
      message: "",
      arguments: [],
      specialIdentifiers: {},
      isTestRun: false,
      timestamp: new Date().toISOString(),
    });
  });

  const timerCheckInterval = Number(process.env.TIMER_CHECK_INTERVAL_MS ?? 15_000);
  timerScheduler.start(timerCheckInterval);

  logger.log("Worker subscriptions active — command engine ready");

  // Graceful shutdown
  const shutdown = async () => {
    logger.log("Shutting down...");
    timerScheduler.stop();
    await twitchChat.stop();
    await subscriber.close();
    if (redis) await redis.quit();
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
