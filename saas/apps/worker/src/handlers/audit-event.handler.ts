import type { PrismaClient } from "@prisma/client";

interface AuditEventMessage {
  tenantId: string;
  action: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export class AuditEventHandler {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(data: Record<string, unknown>): Promise<void> {
    const msg = data as unknown as AuditEventMessage;
    console.log(
      `[AuditEventHandler] Recording audit event: ${msg.action} on ${msg.entityType}/${msg.entityId}`,
    );

    await this.prisma.auditEvent.create({
      data: {
        tenantId: msg.tenantId,
        action: msg.action,
        entityType: msg.entityType,
        entityId: msg.entityId,
        payload: msg.payload as object,
      },
    });
  }
}
