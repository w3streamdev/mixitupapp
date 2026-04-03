import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { PubSubPublisher } from "../../events/pubsub.publisher.js";
import { PremadeCommandsService } from "./premade-commands.service.js";
import type { CreateCommandBody } from "./dto/create-command.body.js";
import type { UpdateCommandBody } from "./dto/update-command.body.js";
import type { ChatTriggerBody } from "./dto/chat-trigger.body.js";
import type { CommandHistoryQuery } from "./dto/command-history.query.js";

/**
 * Resolve basic special identifiers in a chat action template.
 * This is a lightweight version used at the API layer so the chat-bridge
 * can send responses without waiting for the worker engine.
 */
function resolveBasicIdentifiers(
  template: string,
  context: {
    username: string;
    displayName: string;
    message: string;
    arguments: string[];
  },
): string {
  let result = template;

  result = result.replace(/\$username/gi, context.username);
  result = result.replace(/\$userdisplayname/gi, context.displayName);
  result = result.replace(/\$message/gi, context.message);

  const args = context.arguments;
  result = result.replace(/\$allargs/gi, args.join(" "));
  result = result.replace(/\$argcount/gi, String(args.length));

  for (let i = 1; i <= 9; i++) {
    const pattern = new RegExp(`\\$args?${i}`, "gi");
    result = result.replace(pattern, args[i - 1] ?? "");
  }

  // $randomnumberN — random integer from 1 to N
  result = result.replace(/\$randomnumber(\d+)/gi, (_match: string, maxStr: string) => {
    const max = parseInt(maxStr, 10);
    if (max <= 0 || isNaN(max)) return "0";
    return String(Math.floor(Math.random() * max) + 1);
  });

  // $randomnumber (no suffix) — 1 to 100
  result = result.replace(/\$randomnumber/gi, String(Math.floor(Math.random() * 100) + 1));

  // Date/time identifiers
  const now = new Date();
  result = result.replace(/\$datetime/gi, now.toISOString());
  result = result.replace(/\$date/gi, now.toISOString().split("T")[0]!);
  result = result.replace(/\$time/gi, now.toTimeString().split(" ")[0]!);

  return result;
}

@Injectable()
export class CommandsService {
  private readonly logger = new Logger(CommandsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pubsub: PubSubPublisher,
    private readonly premadeService: PremadeCommandsService,
  ) {}

  async getById(tenantId: string, commandId: string) {
    const command = await this.prisma.command.findFirst({ where: { id: commandId, tenantId } });
    if (!command) throw new NotFoundException(`Command with ID '${commandId}' not found`);
    return command;
  }

  async list(tenantId: string, skip: number, pageSize: number) {
    const [totalCount, commands] = await this.prisma.$transaction([
      this.prisma.command.count({ where: { tenantId } }),
      this.prisma.command.findMany({
        where: { tenantId },
        orderBy: { id: "asc" },
        skip,
        take: pageSize,
      }),
    ]);
    return { totalCount, commands };
  }

  async create(tenantId: string, dto: CreateCommandBody) {
    return this.prisma.command.create({
      data: {
        tenantId,
        name: dto.name,
        type: dto.type,
        isEnabled: dto.isEnabled ?? true,
        unlocked: dto.unlocked ?? true,
        groupName: dto.groupName ?? null,
        definition: dto.definition as Prisma.InputJsonValue,
      },
    });
  }

  async update(tenantId: string, commandId: string, dto: UpdateCommandBody) {
    await this.getById(tenantId, commandId);
    const data: Prisma.CommandUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.isEnabled !== undefined) data.isEnabled = dto.isEnabled;
    if (dto.unlocked !== undefined) data.unlocked = dto.unlocked;
    if (dto.groupName !== undefined) data.groupName = dto.groupName;
    if (dto.definition !== undefined) data.definition = dto.definition as Prisma.InputJsonValue;
    return this.prisma.command.update({
      where: { id: commandId },
      data,
    });
  }

  async delete(tenantId: string, commandId: string) {
    await this.getById(tenantId, commandId);
    await this.prisma.command.delete({ where: { id: commandId } });
  }

  async updateState(tenantId: string, commandId: string, state: number) {
    const command = await this.getById(tenantId, commandId);
    let isEnabled: boolean;
    if (state === 0) isEnabled = false;
    else if (state === 1) isEnabled = true;
    else if (state === 2) isEnabled = !command.isEnabled;
    else throw new BadRequestException("Invalid command state option");

    return this.prisma.command.update({ where: { id: command.id }, data: { isEnabled } });
  }

  async enqueueRun(
    tenantId: string,
    commandId: string,
    payload: Record<string, unknown>,
    options?: { isTestRun?: boolean },
  ) {
    const command = await this.getById(tenantId, commandId);
    const executionId = randomUUID();
    const triggerType = options?.isTestRun ? "test" : "api";

    await this.prisma.commandExecution.create({
      data: {
        id: executionId,
        tenantId,
        commandId: command.id,
        status: "pending",
        triggerType,
        input: payload as Prisma.InputJsonValue,
      },
    });

    await this.pubsub.publishCommandRun(tenantId, command.id, {
      executionId,
      triggerType,
      isTestRun: options?.isTestRun ?? false,
      ...payload,
    });

    this.logger.log(
      `Enqueued command run ${executionId} for command ${command.id} (trigger=${triggerType})`,
    );

    return { accepted: true, executionId, tenantId, commandId: command.id };
  }

  async triggerFromChat(tenantId: string, body: ChatTriggerBody) {
    const commands = await this.prisma.command.findMany({
      where: { tenantId, type: "chat", isEnabled: true },
    });

    const messageLower = body.message.toLowerCase();

    for (const command of commands) {
      const definition = command.definition as Record<string, unknown> | null;
      if (!definition) continue;

      const triggers = definition.triggers;
      if (!Array.isArray(triggers)) continue;

      for (const trigger of triggers) {
        const triggerText = typeof trigger === "string" ? trigger : trigger?.text;
        const caseSensitive = typeof trigger === "object" && trigger?.caseSensitive === true;
        if (typeof triggerText !== "string" || !triggerText) continue;

        const msgCmp = caseSensitive ? body.message : messageLower;
        const trigCmp = caseSensitive ? triggerText : triggerText.toLowerCase();

        if (msgCmp.startsWith(trigCmp) && (msgCmp.length === trigCmp.length || msgCmp[trigCmp.length] === " ")) {
          const afterTrigger = body.message.slice(triggerText.length).trim();
          const args = afterTrigger ? afterTrigger.split(/\s+/) : [];
          const executionId = randomUUID();

          await this.prisma.commandExecution.create({
            data: {
              id: executionId,
              tenantId,
              commandId: command.id,
              status: "pending",
              triggerType: "chat",
              platform: body.platform,
              userId: body.userId,
              input: {
                platform: body.platform,
                userId: body.userId,
                username: body.username,
                displayName: body.displayName,
                message: afterTrigger,
                arguments: args,
                trigger: triggerText,
              } as Prisma.InputJsonValue,
            },
          });

          await this.pubsub.publishCommandRun(tenantId, command.id, {
            executionId,
            triggerType: "chat",
            platform: body.platform,
            userId: body.userId,
            username: body.username,
            displayName: body.displayName,
            message: afterTrigger,
            arguments: args,
            isTestRun: false,
          });

          this.logger.log(
            `Chat trigger matched command ${command.id} (trigger="${triggerText}") -> execution ${executionId}`,
          );

          // Extract chat action responses so the chat-bridge can send them directly
          const chatResponses: string[] = [];
          const actions = definition.actions;
          if (Array.isArray(actions)) {
            const identifierContext = {
              username: body.username,
              displayName: body.displayName,
              message: afterTrigger,
              arguments: args,
            };
            for (const action of actions) {
              if (
                typeof action === "object" &&
                action !== null &&
                (action as Record<string, unknown>).type === "chat" &&
                typeof (action as Record<string, unknown>).message === "string"
              ) {
                const resolved = resolveBasicIdentifiers(
                  (action as Record<string, unknown>).message as string,
                  identifierContext,
                );
                chatResponses.push(resolved);
              }
            }
          }

          return { matched: true, commandId: command.id, executionId, chatResponses };
        }
      }
    }

    // If no user command matched, check pre-made commands
    const premadeResult = await this.premadeService.tryMatch(tenantId, body);
    if (premadeResult) {
      this.logger.log(
        `Pre-made command "${premadeResult.commandName}" matched for tenant ${tenantId}`,
      );
      return { matched: true, response: premadeResult.response, premade: true };
    }

    return { matched: false };
  }

  async getHistory(tenantId: string, query: CommandHistoryQuery) {
    const where: Prisma.CommandExecutionWhereInput = { tenantId };
    if (query.commandId) where.commandId = query.commandId;
    if (query.status) where.status = query.status;

    const [totalCount, executions] = await this.prisma.$transaction([
      this.prisma.commandExecution.count({ where }),
      this.prisma.commandExecution.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: query.skip,
        take: query.pageSize,
      }),
    ]);

    return { totalCount, executions };
  }
}
