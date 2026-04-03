import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";

export interface PremadeContext {
  tenantId: string;
  userId: string;
  username: string;
  displayName: string;
  message: string;
  arguments: string[];
}

export interface PremadeCommand {
  triggers: string[];
  name: string;
  description: string;
  minRole: string;
  execute(context: PremadeContext): Promise<string>;
}

const EIGHT_BALL_RESPONSES = [
  "It is certain.",
  "It is decidedly so.",
  "Without a doubt.",
  "Yes definitely.",
  "You may rely on it.",
  "As I see it, yes.",
  "Most likely.",
  "Outlook good.",
  "Yes.",
  "Signs point to yes.",
  "Reply hazy, try again.",
  "Ask again later.",
  "Better not tell you now.",
  "Cannot predict now.",
  "Concentrate and ask again.",
  "Don't count on it.",
  "My reply is no.",
  "My sources say no.",
  "Outlook not so good.",
  "Very doubtful.",
];

@Injectable()
export class PremadeCommandsService {
  private readonly logger = new Logger(PremadeCommandsService.name);
  private readonly commands: PremadeCommand[];

  constructor(private readonly prisma: PrismaService) {
    this.commands = this.buildCommands();
  }

  private buildCommands(): PremadeCommand[] {
    return [
      {
        triggers: ["!commands"],
        name: "Commands List",
        description: "Lists all enabled chat commands the user has access to",
        minRole: "Everyone",
        execute: async (ctx: PremadeContext): Promise<string> => {
          const commands = await this.prisma.command.findMany({
            where: { tenantId: ctx.tenantId, type: "chat", isEnabled: true },
          });

          const triggerList: string[] = [];
          for (const cmd of commands) {
            const definition = cmd.definition as Record<string, unknown> | null;
            if (!definition) continue;
            const triggers = definition.triggers;
            if (!Array.isArray(triggers)) continue;
            for (const trigger of triggers) {
              const text = typeof trigger === "string" ? trigger : trigger?.text;
              if (typeof text === "string" && text) {
                triggerList.push(text);
              }
            }
          }

          // Also include pre-made command triggers
          const premadeTriggers = this.commands.map((c) => c.triggers[0]);
          const allTriggers = [...triggerList, ...premadeTriggers];

          if (allTriggers.length === 0) {
            return "No commands available.";
          }

          return `Available commands: ${allTriggers.join(", ")}`;
        },
      },
      {
        triggers: ["!uptime"],
        name: "Stream Uptime",
        description: "Shows how long the stream has been live",
        minRole: "Everyone",
        execute: async (): Promise<string> => {
          return "Stream uptime is not available. Connect a streaming platform to enable this feature.";
        },
      },
      {
        triggers: ["!followage"],
        name: "Follow Age",
        description: "Shows how long the user has been following",
        minRole: "Everyone",
        execute: async (): Promise<string> => {
          return "Follow age information is not available. Connect Twitch to enable this feature.";
        },
      },
      {
        triggers: ["!title"],
        name: "Stream Title",
        description: "Shows the current stream title",
        minRole: "Everyone",
        execute: async (): Promise<string> => {
          return "Stream title is not available. Connect a streaming platform to enable this feature.";
        },
      },
      {
        triggers: ["!game"],
        name: "Stream Game",
        description: "Shows the current stream game/category",
        minRole: "Everyone",
        execute: async (): Promise<string> => {
          return "Stream game/category is not available. Connect a streaming platform to enable this feature.";
        },
      },
      {
        triggers: ["!quote"],
        name: "Random Quote",
        description: "Returns a random quote",
        minRole: "Everyone",
        execute: async (ctx: PremadeContext): Promise<string> => {
          // Look for a counter or command that stores quotes
          // For now, quotes are stored as commands of type "quote"
          const quoteCommands = await this.prisma.command.findMany({
            where: { tenantId: ctx.tenantId, type: "quote", isEnabled: true },
          });

          if (quoteCommands.length === 0) {
            return "No quotes found. Add quotes with !addquote [text]";
          }

          const randomIndex = Math.floor(Math.random() * quoteCommands.length);
          const quote = quoteCommands[randomIndex]!;
          const definition = quote.definition as Record<string, unknown> | null;
          const text = definition?.text ?? quote.name;
          return `Quote #${randomIndex + 1}: ${text}`;
        },
      },
      {
        triggers: ["!addquote"],
        name: "Add Quote",
        description: "Adds a new quote (requires Moderator role)",
        minRole: "Moderator",
        execute: async (ctx: PremadeContext): Promise<string> => {
          const quoteText = ctx.message.trim();
          if (!quoteText) {
            return "Usage: !addquote [text]";
          }

          const existingQuotes = await this.prisma.command.count({
            where: { tenantId: ctx.tenantId, type: "quote" },
          });

          await this.prisma.command.create({
            data: {
              tenantId: ctx.tenantId,
              name: `Quote #${existingQuotes + 1}`,
              type: "quote",
              isEnabled: true,
              unlocked: true,
              definition: {
                text: quoteText,
                addedBy: ctx.displayName,
                addedAt: new Date().toISOString(),
              },
            },
          });

          return `Quote #${existingQuotes + 1} added: "${quoteText}"`;
        },
      },
      {
        triggers: ["!w3streamitup"],
        name: "w3StreamItUp Info",
        description: "Shows information about w3StreamItUp",
        minRole: "Everyone",
        execute: async (): Promise<string> => {
          return "This stream is powered by w3StreamItUp! Check it out at https://w3streamitup.com";
        },
      },
      {
        triggers: ["!8ball"],
        name: "Magic 8 Ball",
        description: "Ask the Magic 8 Ball a question",
        minRole: "Everyone",
        execute: async (ctx: PremadeContext): Promise<string> => {
          const question = ctx.message.trim();
          if (!question) {
            return "Usage: !8ball [question]";
          }

          const responseIndex = Math.floor(Math.random() * EIGHT_BALL_RESPONSES.length);
          return `🎱 ${EIGHT_BALL_RESPONSES[responseIndex]}`;
        },
      },
    ];
  }

  /**
   * Get the list of all pre-made commands and their metadata.
   */
  getAll(): Array<{ triggers: string[]; name: string; description: string; minRole: string }> {
    return this.commands.map((c) => ({
      triggers: c.triggers,
      name: c.name,
      description: c.description,
      minRole: c.minRole,
    }));
  }

  /**
   * Attempt to match a chat message against pre-made commands.
   * Returns the response string if matched, or null if no match.
   */
  async tryMatch(
    tenantId: string,
    body: { userId: string; username: string; displayName: string; message: string },
  ): Promise<{ response: string; commandName: string } | null> {
    const messageLower = body.message.toLowerCase();

    for (const command of this.commands) {
      for (const trigger of command.triggers) {
        const triggerLower = trigger.toLowerCase();
        if (
          messageLower.startsWith(triggerLower) &&
          (messageLower.length === triggerLower.length || messageLower[triggerLower.length] === " ")
        ) {
          const afterTrigger = body.message.slice(trigger.length).trim();
          const args = afterTrigger ? afterTrigger.split(/\s+/) : [];

          const context: PremadeContext = {
            tenantId,
            userId: body.userId,
            username: body.username,
            displayName: body.displayName,
            message: afterTrigger,
            arguments: args,
          };

          try {
            const response = await command.execute(context);
            this.logger.log(
              `Pre-made command "${command.name}" matched trigger "${trigger}" for tenant ${tenantId}`,
            );
            return { response, commandName: command.name };
          } catch (err) {
            this.logger.error(
              `Error executing pre-made command "${command.name}": ${err instanceof Error ? err.message : "Unknown error"}`,
            );
            return { response: "An error occurred while executing this command.", commandName: command.name };
          }
        }
      }
    }

    return null;
  }
}
