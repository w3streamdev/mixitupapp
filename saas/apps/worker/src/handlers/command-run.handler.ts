import type { PrismaClient } from "@prisma/client";
import type { CommandEngine } from "../engine/command-engine.js";
import type { CommandRunMessage } from "../engine/types.js";

export class CommandRunHandler {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly engine?: CommandEngine,
  ) {}

  async handle(data: Record<string, unknown>): Promise<void> {
    const msg = data as unknown as CommandRunMessage;
    console.log(
      `[CommandRunHandler] Processing command ${msg.commandId} for tenant ${msg.tenantId}`,
    );

    // If the engine is wired up, delegate to it for full execution
    if (this.engine) {
      await this.engine.executeCommand(msg);
      return;
    }

    // Fallback: legacy stub behaviour (no engine configured)
    const command = await this.prisma.command.findFirst({
      where: { id: msg.commandId, tenantId: msg.tenantId },
    });

    if (!command) {
      console.warn(`[CommandRunHandler] Command ${msg.commandId} not found`);
      return;
    }

    if (!command.isEnabled) {
      console.warn(`[CommandRunHandler] Command ${msg.commandId} is disabled`);
      return;
    }

    console.log(
      `[CommandRunHandler] Executed command '${command.name}' (type: ${command.type})`,
    );

    await this.prisma.auditEvent.create({
      data: {
        tenantId: msg.tenantId,
        action: "command.executed",
        entityType: "Command",
        entityId: msg.commandId,
        payload: { executedAt: new Date().toISOString() },
      },
    });
  }
}
