import type { PrismaClient } from "@prisma/client";

interface CommandRunMessage {
  tenantId: string;
  commandId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export class CommandRunHandler {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(data: Record<string, unknown>): Promise<void> {
    const msg = data as unknown as CommandRunMessage;
    console.log(`[CommandRunHandler] Processing command ${msg.commandId} for tenant ${msg.tenantId}`);

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

    // Process command definition and execute actions
    // This is where the command execution logic would live
    console.log(`[CommandRunHandler] Executed command '${command.name}' (type: ${command.type})`);

    await this.prisma.auditEvent.create({
      data: {
        tenantId: msg.tenantId,
        action: "command.executed",
        entityType: "Command",
        entityId: msg.commandId,
        payload: { ...msg.payload, executedAt: new Date().toISOString() },
      },
    });
  }
}
