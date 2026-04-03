import type { PrismaClient } from "@prisma/client";
import type { ActionExecutor } from "../action-executor.interface.js";
import type { CurrencyAction, ExecutionContext } from "../types.js";

export class CurrencyActionExecutor implements ActionExecutor<CurrencyAction> {
  readonly type = "currency";

  constructor(private readonly prisma: PrismaClient) {}

  async execute(action: CurrencyAction, context: ExecutionContext): Promise<void> {
    const { currencyId, operation, amount } = action;
    const userId = context.triggerUserId;

    switch (operation) {
      case "give":
        await this.prisma.$transaction(async (tx) => {
          await tx.currencyLedger.upsert({
            where: { currencyId_userId: { currencyId, userId } },
            create: { currencyId, userId, amount },
            update: { amount: { increment: amount } },
          });
        });
        break;

      case "take":
        await this.prisma.$transaction(async (tx) => {
          const ledger = await tx.currencyLedger.findUnique({
            where: { currencyId_userId: { currencyId, userId } },
            select: { amount: true },
          });

          const balance = ledger?.amount ?? 0;
          if (balance < amount) {
            throw new Error(
              `Insufficient balance: user ${userId} has ${balance} but needs ${amount} for currency ${currencyId}`,
            );
          }

          await tx.currencyLedger.update({
            where: { currencyId_userId: { currencyId, userId } },
            data: { amount: { decrement: amount } },
          });
        });
        break;

      default:
        console.warn(`[CurrencyActionExecutor] Unknown operation: ${operation as string}`);
    }
  }
}
