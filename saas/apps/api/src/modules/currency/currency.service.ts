import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class CurrencyService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, skip: number, pageSize: number) {
    const [totalCount, currencies] = await this.prisma.$transaction([
      this.prisma.currency.count({ where: { tenantId } }),
      this.prisma.currency.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        skip,
        take: pageSize,
      }),
    ]);
    return { totalCount, currencies };
  }

  async getById(tenantId: string, currencyId: string) {
    const currency = await this.prisma.currency.findFirst({
      where: { id: currencyId, tenantId },
    });
    if (!currency) throw new NotFoundException(`Currency '${currencyId}' not found`);
    return currency;
  }

  async create(
    tenantId: string,
    data: {
      name: string;
      acquireAmount?: number;
      acquireInterval?: number;
      maxAmount?: number;
    },
  ) {
    return this.prisma.currency.create({
      data: {
        tenantId,
        name: data.name,
        acquireAmount: data.acquireAmount ?? 1,
        acquireInterval: data.acquireInterval ?? 60,
        maxAmount: data.maxAmount ?? 0,
      },
    });
  }

  async getUserBalance(tenantId: string, currencyId: string, userId: string) {
    await this.getById(tenantId, currencyId);
    const ledger = await this.prisma.currencyLedger.findUnique({
      where: { currencyId_userId: { currencyId, userId } },
    });
    return ledger?.amount ?? 0;
  }

  async adjustBalance(
    tenantId: string,
    currencyId: string,
    userId: string,
    amount: number,
    reason?: string,
  ) {
    await this.getById(tenantId, currencyId);

    const result = await this.prisma.$transaction(async (tx) => {
      const ledger = await tx.currencyLedger.upsert({
        where: { currencyId_userId: { currencyId, userId } },
        create: { currencyId, userId, amount },
        update: { amount: { increment: amount } },
      });

      await tx.auditEvent.create({
        data: {
          tenantId,
          action: "currency.balance.adjusted",
          entityType: "CurrencyLedger",
          entityId: ledger.id,
          payload: { currencyId, userId, amount, reason: reason ?? null, newBalance: ledger.amount },
        },
      });

      return ledger.amount;
    });

    return result;
  }

  async remove(tenantId: string, currencyId: string) {
    await this.getById(tenantId, currencyId);
    await this.prisma.currency.delete({ where: { id: currencyId } });
  }
}
