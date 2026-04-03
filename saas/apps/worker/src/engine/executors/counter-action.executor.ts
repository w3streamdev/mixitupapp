import type { PrismaClient } from "@prisma/client";
import type { ActionExecutor } from "../action-executor.interface.js";
import type { CounterAction, ExecutionContext } from "../types.js";

export class CounterActionExecutor implements ActionExecutor<CounterAction> {
  readonly type = "counter";

  constructor(private readonly prisma: PrismaClient) {}

  async execute(action: CounterAction, context: ExecutionContext): Promise<void> {
    const { counterId, operation, amount } = action;

    let updated: { amount: number };

    switch (operation) {
      case "increment":
        updated = await this.prisma.counter.update({
          where: { id: counterId, tenantId: context.tenantId },
          data: { amount: { increment: amount ?? 1 } },
          select: { amount: true },
        });
        break;

      case "decrement":
        updated = await this.prisma.counter.update({
          where: { id: counterId, tenantId: context.tenantId },
          data: { amount: { decrement: amount ?? 1 } },
          select: { amount: true },
        });
        break;

      case "set":
        updated = await this.prisma.counter.update({
          where: { id: counterId, tenantId: context.tenantId },
          data: { amount: amount ?? 0 },
          select: { amount: true },
        });
        break;

      case "reset": {
        const counter = await this.prisma.counter.findUniqueOrThrow({
          where: { id: counterId, tenantId: context.tenantId },
          select: { resetAmount: true },
        });
        updated = await this.prisma.counter.update({
          where: { id: counterId, tenantId: context.tenantId },
          data: { amount: counter.resetAmount },
          select: { amount: true },
        });
        break;
      }

      default:
        console.warn(`[CounterActionExecutor] Unknown operation: ${operation as string}`);
        return;
    }

    // Store new counter value so chat messages can reference it
    context.specialIdentifiers["$counter"] = String(updated.amount);
  }
}
