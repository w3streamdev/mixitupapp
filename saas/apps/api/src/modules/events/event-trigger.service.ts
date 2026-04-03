import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { PubSubPublisher } from "../../events/pubsub.publisher.js";

export interface PlatformEvent {
  tenantId: string;
  platform: string;
  eventType: string;
  userId?: string | undefined;
  username?: string | undefined;
  displayName?: string | undefined;
  data: Record<string, unknown>;
}

interface EventConfig {
  eventType?: string;
  platform?: string;
  // Bits-specific
  bitsAmount?: number;
  bitsMin?: number;
  bitsMax?: number;
  // Channel points
  rewardName?: string;
  rewardId?: string;
}

interface CommandRow {
  id: string;
  tenantId: string;
  definition: unknown;
}

@Injectable()
export class EventTriggerService {
  private readonly logger = new Logger(EventTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pubsub: PubSubPublisher,
  ) {}

  async processEvent(event: PlatformEvent): Promise<{ triggered: number; executions: string[] }> {
    const commands = await this.prisma.command.findMany({
      where: { tenantId: event.tenantId, type: "event", isEnabled: true },
    });

    // For bits events, use priority matching
    if (event.eventType === "bits" && typeof event.data.amount === "number") {
      return this.processBitsEvent(event, commands);
    }

    // For channel points, use reward matching
    if (event.eventType === "channel_point_redeem") {
      return this.processChannelPointEvent(event, commands);
    }

    // Generic event matching
    const executions: string[] = [];

    for (const command of commands) {
      const definition = command.definition as Record<string, unknown> | null;
      if (!definition) continue;

      const eventConfig = definition.event as EventConfig | undefined;
      if (!eventConfig?.eventType) continue;
      if (eventConfig.eventType !== event.eventType) continue;
      if (eventConfig.platform && eventConfig.platform !== event.platform) continue;

      const executionId = await this.fireCommand(event, command);
      executions.push(executionId);
    }

    return { triggered: executions.length, executions };
  }

  /**
   * Bits matching with priority:
   * 1. Exact amount match
   * 2. Smallest matching range
   * 3. Largest matching range (catch-all)
   */
  private async processBitsEvent(
    event: PlatformEvent,
    commands: CommandRow[],
  ): Promise<{ triggered: number; executions: string[] }> {
    const amount = event.data.amount as number;
    let exactMatch: CommandRow | null = null;
    let bestRange: { command: CommandRow; rangeSize: number } | null = null;

    for (const command of commands) {
      const definition = command.definition as Record<string, unknown> | null;
      if (!definition) continue;

      const eventConfig = definition.event as EventConfig | undefined;
      if (!eventConfig) continue;
      if (eventConfig.eventType !== "bits") continue;
      if (eventConfig.platform && eventConfig.platform !== event.platform) continue;

      // Exact amount match (highest priority)
      if (eventConfig.bitsAmount !== undefined && eventConfig.bitsAmount === amount) {
        exactMatch = command;
        break;
      }

      // Range match
      if (eventConfig.bitsMin !== undefined || eventConfig.bitsMax !== undefined) {
        const min = eventConfig.bitsMin ?? 0;
        const max = eventConfig.bitsMax ?? Number.MAX_SAFE_INTEGER;

        if (amount >= min && amount <= max) {
          const rangeSize = max - min;
          if (!bestRange || rangeSize < bestRange.rangeSize) {
            bestRange = { command, rangeSize };
          }
        }
      }
    }

    const matched = exactMatch ?? bestRange?.command;
    if (!matched) {
      return { triggered: 0, executions: [] };
    }

    const executionId = await this.fireCommand(event, matched);
    return { triggered: 1, executions: [executionId] };
  }

  /**
   * Channel point matching by reward ID (preferred) or reward name (fallback).
   */
  private async processChannelPointEvent(
    event: PlatformEvent,
    commands: CommandRow[],
  ): Promise<{ triggered: number; executions: string[] }> {
    const rewardId = event.data.rewardId as string | undefined;
    const rewardName = event.data.rewardName as string | undefined;

    let idMatch: CommandRow | null = null;
    let nameMatch: CommandRow | null = null;

    for (const command of commands) {
      const definition = command.definition as Record<string, unknown> | null;
      if (!definition) continue;

      const eventConfig = definition.event as EventConfig | undefined;
      if (!eventConfig) continue;
      if (eventConfig.eventType !== "channel_point_redeem") continue;
      if (eventConfig.platform && eventConfig.platform !== event.platform) continue;

      // Match by reward ID (highest priority)
      if (rewardId && eventConfig.rewardId && eventConfig.rewardId === rewardId) {
        idMatch = command;
        break;
      }

      // Match by reward name
      if (
        rewardName &&
        eventConfig.rewardName &&
        eventConfig.rewardName.toLowerCase() === rewardName.toLowerCase()
      ) {
        nameMatch = command;
      }
    }

    const matched = idMatch ?? nameMatch;
    if (!matched) {
      return { triggered: 0, executions: [] };
    }

    const executionId = await this.fireCommand(event, matched);
    return { triggered: 1, executions: [executionId] };
  }

  private async fireCommand(event: PlatformEvent, command: CommandRow): Promise<string> {
    const executionId = randomUUID();

    // Build special identifiers from event data
    const specialIdentifiers: Record<string, string> = {};
    for (const [key, value] of Object.entries(event.data)) {
      specialIdentifiers[`$${key}`] = String(value);
    }

    await this.prisma.commandExecution.create({
      data: {
        id: executionId,
        tenantId: event.tenantId,
        commandId: command.id,
        status: "pending",
        triggerType: "event",
        platform: event.platform,
        userId: event.userId ?? null,
        input: {
          eventType: event.eventType,
          platform: event.platform,
          userId: event.userId,
          username: event.username,
          displayName: event.displayName,
          data: event.data,
          executionId,
        } as Prisma.InputJsonValue,
      },
    });

    await this.pubsub.publishCommandRun(event.tenantId, command.id, {
      executionId,
      triggerType: "event",
      platform: event.platform,
      userId: event.userId ?? "",
      username: event.username ?? "",
      displayName: event.displayName ?? "",
      message: "",
      arguments: [],
      specialIdentifiers,
      isTestRun: false,
    });

    this.logger.log(
      `Event ${event.eventType} triggered command ${command.id} -> execution ${executionId}`,
    );

    return executionId;
  }
}
