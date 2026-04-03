import type { PrismaClient } from "@prisma/client";
import type { CommandEngine } from "../engine/command-engine.js";
import type { CommandRunMessage } from "../engine/types.js";

const logger = {
  log: (msg: string) => console.log(`[TwitchChat] ${msg}`),
  warn: (msg: string) => console.warn(`[TwitchChat] ${msg}`),
  error: (msg: string, err?: unknown) => console.error(`[TwitchChat] ${msg}`, err),
};

interface ChatTrigger {
  text: string;
  isWildcard?: boolean;
  caseSensitive?: boolean;
}

interface CommandDef {
  triggers?: ChatTrigger[];
  actions?: unknown[];
  requirements?: unknown;
}

interface TmiClient {
  connect(): Promise<[string, number]>;
  disconnect(): Promise<[string, number]>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  say(channel: string, message: string): Promise<[string]>;
}

/**
 * Connects to Twitch IRC via tmi.js, listens for chat messages,
 * matches them against chat commands, and executes via the engine.
 * Also provides sendMessage() for the chat action executor.
 */
export class TwitchChatService {
  private client: TmiClient | null = null;
  private channels: string[] = [];
  private connected = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly engine: CommandEngine,
  ) {}

  async start(): Promise<void> {
    // Load all tenants with Twitch connections to determine which channels to join
    const connections = await this.prisma.integrationConnection.findMany({
      where: { platform: "twitch" },
      include: { tenant: true },
    });

    if (connections.length === 0) {
      logger.warn("No Twitch connections found — chat listener not started");
      return;
    }

    // Use the first connection's token (single-tenant for now)
    const conn = connections[0]!;
    const username = (conn.metadata as Record<string, unknown>)?.username as string
      ?? conn.platformUserId ?? "bot";
    const channels = connections.map((c) => {
      const meta = c.metadata as Record<string, unknown> | null;
      return (meta?.username as string) ?? c.platformUserId ?? "";
    }).filter(Boolean);

    this.channels = channels;

    try {
      const tmi = await import("tmi.js");
      const Client = tmi.Client ?? tmi.default?.Client ?? tmi.client;

      this.client = new Client({
        options: { debug: false },
        connection: {
          reconnect: true,
          secure: true,
        },
        identity: {
          username,
          password: `oauth:${conn.accessToken}`,
        },
        channels,
      }) as TmiClient;

      this.client.on("message", (channel: unknown, tags: unknown, message: unknown, self: unknown) => {
        if (self) return; // Ignore messages from the bot itself
        void this.handleMessage(
          channel as string,
          tags as Record<string, string>,
          message as string,
        );
      });

      this.client.on("connected", (addr: unknown, port: unknown) => {
        this.connected = true;
        logger.log(`Connected to Twitch IRC at ${addr}:${port}`);
        logger.log(`Joined channels: ${channels.join(", ")}`);
      });

      this.client.on("disconnected", (reason: unknown) => {
        this.connected = false;
        logger.warn(`Disconnected from Twitch IRC: ${reason}`);
      });

      this.client.on("reconnect", () => {
        logger.log("Reconnecting to Twitch IRC...");
      });

      // Small delay to ensure Cloud Run networking is fully ready
      await new Promise((r) => setTimeout(r, 3000));
      logger.log(`Connecting as ${username} to channels: ${channels.join(", ")} with token length ${conn.accessToken.length}`);
      await this.client.connect();
      logger.log("tmi.js connect() resolved successfully");
    } catch (err) {
      logger.error("Failed to start Twitch chat", err);
    }
  }

  async stop(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.connected = false;
      logger.log("Twitch chat disconnected");
    }
  }

  async sendMessage(channel: string, message: string): Promise<void> {
    if (!this.client || !this.connected) {
      logger.warn(`Cannot send message — not connected (channel: ${channel})`);
      return;
    }
    try {
      const ch = channel.startsWith("#") ? channel : `#${channel}`;
      await this.client.say(ch, message);
    } catch (err) {
      logger.error(`Failed to send message to ${channel}`, err);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async handleMessage(
    channel: string,
    tags: Record<string, string>,
    message: string,
  ): Promise<void> {
    const cleanChannel = channel.replace("#", "");

    // Find the tenant for this channel
    const connection = await this.prisma.integrationConnection.findFirst({
      where: {
        platform: "twitch",
        metadata: { path: ["username"], equals: cleanChannel },
      },
    });

    if (!connection) {
      // Try matching by platformUserId
      const connById = await this.prisma.integrationConnection.findFirst({
        where: { platform: "twitch" },
      });
      if (!connById) return;
      await this.processMessage(connById.tenantId, cleanChannel, tags, message);
      return;
    }

    await this.processMessage(connection.tenantId, cleanChannel, tags, message);
  }

  private async processMessage(
    tenantId: string,
    channel: string,
    tags: Record<string, string>,
    message: string,
  ): Promise<void> {
    // Load enabled chat commands for this tenant
    const commands = await this.prisma.command.findMany({
      where: { tenantId, type: "chat", isEnabled: true },
    });

    const messageLower = message.toLowerCase().trim();

    for (const command of commands) {
      const definition = command.definition as unknown as CommandDef | null;
      if (!definition?.triggers) continue;

      for (const trigger of definition.triggers) {
        const triggerText = typeof trigger === "string" ? trigger : trigger.text;
        const caseSensitive = typeof trigger === "object" && trigger.caseSensitive === true;
        if (!triggerText) continue;

        const msgCmp = caseSensitive ? message.trim() : messageLower;
        const trigCmp = caseSensitive ? triggerText : triggerText.toLowerCase();

        if (msgCmp.startsWith(trigCmp) && (msgCmp.length === trigCmp.length || msgCmp[trigCmp.length] === " ")) {
          const afterTrigger = message.slice(triggerText.length).trim();
          const args = afterTrigger ? afterTrigger.split(/\s+/) : [];

          const executionId = `irc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          const userId = tags["user-id"] ?? "";
          const username = tags["username"] ?? tags["display-name"] ?? "";
          const displayName = tags["display-name"] ?? username;

          logger.log(`Matched "${triggerText}" from ${displayName} in #${channel} -> ${command.name}`);

          const msg: CommandRunMessage = {
            tenantId,
            commandId: command.id,
            executionId,
            triggerType: "chat",
            platform: "twitch",
            userId,
            username,
            displayName,
            message: afterTrigger,
            arguments: args,
            specialIdentifiers: {
              "$channel": channel,
            },
            isTestRun: false,
            timestamp: new Date().toISOString(),
          };

          try {
            await this.engine.executeCommand(msg);
          } catch (err) {
            logger.error(`Command execution failed for ${command.name}`, err);
          }

          return; // First match wins
        }
      }
    }

    // Check pre-made commands
    await this.handlePremade(tenantId, channel, tags, message);
  }

  private async handlePremade(
    tenantId: string,
    channel: string,
    tags: Record<string, string>,
    message: string,
  ): Promise<void> {
    const msg = message.trim().toLowerCase();
    void tags; // tags available for future premade commands that need user info

    if (msg === "!8ball" || msg.startsWith("!8ball ")) {
      const responses = [
        "It is certain.", "It is decidedly so.", "Without a doubt.",
        "Yes definitely.", "You may rely on it.", "As I see it, yes.",
        "Most likely.", "Outlook good.", "Yes.", "Signs point to yes.",
        "Reply hazy, try again.", "Ask again later.", "Better not tell you now.",
        "Cannot predict now.", "Concentrate and ask again.",
        "Don't count on it.", "My reply is no.", "My sources say no.",
        "Outlook not so good.", "Very doubtful.",
      ];
      const answer = responses[Math.floor(Math.random() * responses.length)]!;
      await this.sendMessage(channel, `🎱 ${answer}`);
      return;
    }

    if (msg === "!commands") {
      const cmds = await this.prisma.command.findMany({
        where: { tenantId, type: "chat", isEnabled: true },
      });
      const triggers: string[] = [];
      for (const cmd of cmds) {
        const def = cmd.definition as unknown as CommandDef | null;
        if (def?.triggers) {
          for (const t of def.triggers) {
            const text = typeof t === "string" ? t : t.text;
            if (text) triggers.push(text);
          }
        }
      }
      triggers.push("!commands", "!8ball");
      await this.sendMessage(channel, `Available commands: ${triggers.join(", ")}`);
      return;
    }
  }
}
