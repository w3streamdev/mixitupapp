import type { PrismaClient } from "@prisma/client";
import type { ExecutorRegistry } from "./executor-registry.js";
import type {
  CommandRunMessage,
  CommandDefinition,
  CommandAction,
  ExecutionContext,
} from "./types.js";
import type { CooldownService } from "../services/cooldown.service.js";
import type { CommandLockService, LockMode } from "../services/command-lock.service.js";
import { checkRoleRequirement } from "../services/role-checker.js";

const logger = {
  log: (msg: string) => console.log(`[CommandEngine] ${msg}`),
  warn: (msg: string) => console.warn(`[CommandEngine] ${msg}`),
  error: (msg: string, err?: unknown) =>
    console.error(`[CommandEngine] ${msg}`, err),
};

export interface CommandEngineOptions {
  cooldownService?: CooldownService;
  lockService?: CommandLockService;
  lockMode?: LockMode;
}

export class CommandEngine {
  private readonly cooldownService: CooldownService | undefined;
  private readonly lockService: CommandLockService | undefined;
  private readonly lockMode: LockMode;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly registry: ExecutorRegistry,
    options?: CommandEngineOptions,
  ) {
    this.cooldownService = options?.cooldownService;
    this.lockService = options?.lockService;
    this.lockMode = options?.lockMode ?? "none";
  }

  async executeCommand(message: CommandRunMessage): Promise<void> {
    const startTime = Date.now();

    // 1. Load command from DB
    const command = await this.prisma.command.findFirst({
      where: { id: message.commandId, tenantId: message.tenantId },
    });

    if (!command) {
      logger.warn(`Command ${message.commandId} not found for tenant ${message.tenantId}`);
      throw new Error(`Command ${message.commandId} not found`);
    }

    if (!command.isEnabled) {
      logger.warn(`Command ${message.commandId} is disabled`);
      throw new Error(`Command ${message.commandId} is disabled`);
    }

    // 2. Parse definition
    const definition = command.definition as unknown as CommandDefinition;
    if (!definition?.actions?.length) {
      logger.log(`Command ${command.name} has no actions — nothing to execute`);
      return;
    }

    // 3. Record execution start via audit event
    await this.prisma.auditEvent.create({
      data: {
        tenantId: message.tenantId,
        action: "command.execution.started",
        entityType: "Command",
        entityId: message.commandId,
        payload: {
          executionId: message.executionId,
          triggerType: message.triggerType,
          platform: message.platform,
          userId: message.userId,
          isTestRun: message.isTestRun,
          startedAt: new Date().toISOString(),
        },
      },
    });

    // 4. Build execution context (handle both flat and nested payload structures)
    const payload = (message as unknown as Record<string, unknown>).payload as Record<string, unknown> | undefined;
    const context: ExecutionContext = {
      tenantId: message.tenantId,
      commandId: message.commandId,
      executionId: message.executionId ?? (payload?.executionId as string) ?? "unknown",
      platform: message.platform ?? (payload?.platform as string) ?? "unknown",
      triggerType: message.triggerType ?? (payload?.triggerType as string) ?? "api",
      triggerUserId: message.userId ?? (payload?.userId as string) ?? "",
      triggerUsername: message.username ?? (payload?.username as string) ?? "",
      triggerDisplayName: message.displayName ?? (payload?.displayName as string) ?? "",
      message: message.message ?? (payload?.message as string) ?? "",
      arguments: message.arguments ?? (payload?.arguments as string[]) ?? [],
      specialIdentifiers: { ...(message.specialIdentifiers ?? {}), ...((payload?.specialIdentifiers as Record<string, string>) ?? {}) },
      isTestRun: message.isTestRun ?? (payload?.isTestRun as boolean) ?? false,
      depth: 0,
    };

    // 5. Pre-execution checks (skipped for test runs)
    let lockKeys: string[] = [];
    const cooldownSeconds = definition.requirements?.cooldownSeconds ?? 0;
    const userCooldownSeconds = definition.requirements?.userCooldownSeconds ?? 0;

    if (!context.isTestRun) {
      // Role check
      const userRoles =
        context.specialIdentifiers["$userroles"]?.split(",") ?? ["everyone"];
      if (definition.requirements?.roles?.length) {
        if (!checkRoleRequirement(userRoles, definition.requirements.roles)) {
          throw new Error("User does not meet role requirements");
        }
      }

      // Cooldown check
      if (this.cooldownService) {
        const cd = await this.cooldownService.check(
          message.tenantId,
          message.commandId,
          context.triggerUserId,
          cooldownSeconds,
          userCooldownSeconds,
        );
        if (cd.onCooldown) {
          throw new Error(`Command on cooldown (${cd.remaining}s remaining)`);
        }
      }

      // Lock acquisition
      if (this.lockService) {
        const lock = await this.lockService.acquire(
          message.tenantId,
          command.type,
          definition,
          command.unlocked,
          this.lockMode,
        );
        if (!lock.acquired) {
          throw new Error("Command blocked by lock system");
        }
        lockKeys = lock.keys;
      }
    }

    // 6. Execute actions
    try {
      await this.executeActions(definition.actions, context);

      const durationMs = Date.now() - startTime;
      logger.log(
        `Command "${command.name}" (${message.executionId}) completed in ${durationMs}ms`,
      );

      // Set cooldown after successful execution
      if (!context.isTestRun && this.cooldownService) {
        await this.cooldownService.set(
          message.tenantId,
          message.commandId,
          context.triggerUserId,
          cooldownSeconds,
          userCooldownSeconds,
        );
      }

      // 7. Record success
      await this.prisma.auditEvent.create({
        data: {
          tenantId: message.tenantId,
          action: "command.execution.completed",
          entityType: "Command",
          entityId: message.commandId,
          payload: {
            executionId: message.executionId,
            status: "completed",
            durationMs,
          },
        },
      });
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      logger.error(
        `Command "${command.name}" (${message.executionId}) failed after ${durationMs}ms: ${errorMessage}`,
      );

      // 8. Record failure
      await this.prisma.auditEvent.create({
        data: {
          tenantId: message.tenantId,
          action: "command.execution.failed",
          entityType: "Command",
          entityId: message.commandId,
          payload: {
            executionId: message.executionId,
            status: "failed",
            error: errorMessage,
            durationMs,
          },
        },
      });

      throw err;
    } finally {
      // Always release locks, even on failure
      if (lockKeys.length > 0 && this.lockService) {
        await this.lockService.release(lockKeys);
      }
    }
  }

  /**
   * Execute an ordered list of actions sequentially.
   * This method is also called recursively by conditional and command-ref executors.
   */
  async executeActions(
    actions: CommandAction[],
    context: ExecutionContext,
  ): Promise<void> {
    for (const action of actions) {
      const executor = this.registry.get(action.type);
      if (!executor) {
        logger.warn(
          `No executor registered for action type "${action.type}" — skipping`,
        );
        continue;
      }

      await executor.execute(action, context);
    }
  }
}
