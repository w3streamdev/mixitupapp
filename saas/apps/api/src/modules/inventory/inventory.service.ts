import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, skip: number, pageSize: number) {
    const [totalCount, inventories] = await this.prisma.$transaction([
      this.prisma.inventory.count({ where: { tenantId } }),
      this.prisma.inventory.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        skip,
        take: pageSize,
      }),
    ]);
    return { totalCount, inventories };
  }

  async getById(tenantId: string, inventoryId: string) {
    const inv = await this.prisma.inventory.findFirst({
      where: { id: inventoryId, tenantId },
    });
    if (!inv) throw new NotFoundException(`Inventory '${inventoryId}' not found`);
    return inv;
  }

  async create(
    tenantId: string,
    data: {
      name: string;
      defaultMaxAmount?: number;
      shopEnabled?: boolean;
      shopCurrencyId?: string;
    },
  ) {
    return this.prisma.inventory.create({
      data: {
        tenantId,
        name: data.name,
        defaultMaxAmount: data.defaultMaxAmount ?? -1,
        shopEnabled: data.shopEnabled ?? false,
        shopCurrencyId: data.shopCurrencyId ?? null,
      },
    });
  }

  async remove(tenantId: string, inventoryId: string) {
    await this.getById(tenantId, inventoryId);
    await this.prisma.inventory.delete({ where: { id: inventoryId } });
  }

  async listItems(tenantId: string, inventoryId: string, skip: number, pageSize: number) {
    await this.getById(tenantId, inventoryId);
    const [totalCount, items] = await this.prisma.$transaction([
      this.prisma.inventoryItem.count({ where: { inventoryId } }),
      this.prisma.inventoryItem.findMany({
        where: { inventoryId },
        orderBy: { name: "asc" },
        skip,
        take: pageSize,
      }),
    ]);
    return { totalCount, items };
  }

  async createItem(
    tenantId: string,
    inventoryId: string,
    data: { name: string; maxAmount?: number; shopBuyPrice?: number; shopSellPrice?: number },
  ) {
    await this.getById(tenantId, inventoryId);
    return this.prisma.inventoryItem.create({
      data: {
        inventoryId,
        name: data.name,
        maxAmount: data.maxAmount ?? -1,
        shopBuyPrice: data.shopBuyPrice ?? 0,
        shopSellPrice: data.shopSellPrice ?? 0,
      },
    });
  }

  async adjustUserItem(
    tenantId: string,
    inventoryId: string,
    itemId: string,
    userId: string,
    amount: number,
  ) {
    await this.getById(tenantId, inventoryId);

    return this.prisma.$transaction(async (tx) => {
      const ledger = await tx.inventoryLedger.upsert({
        where: { itemId_userId: { itemId, userId } },
        create: { itemId, userId, amount },
        update: { amount: { increment: amount } },
      });

      await tx.auditEvent.create({
        data: {
          tenantId,
          action: "inventory.item.adjusted",
          entityType: "InventoryLedger",
          entityId: ledger.id,
          payload: { inventoryId, itemId, userId, amount, newAmount: ledger.amount },
        },
      });

      return ledger;
    });
  }

  async getUserItemAmount(
    tenantId: string,
    inventoryId: string,
    itemId: string,
    userId: string,
  ): Promise<number> {
    await this.getById(tenantId, inventoryId);
    const ledger = await this.prisma.inventoryLedger.findUnique({
      where: { itemId_userId: { itemId, userId } },
    });
    return ledger?.amount ?? 0;
  }
}
