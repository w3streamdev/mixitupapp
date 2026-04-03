import type { PrismaClient } from "@prisma/client";
import type { ActionExecutor } from "../action-executor.interface.js";
import type {
  ConditionalAction,
  ConditionClause,
  ExecutionContext,
  CommandAction,
} from "../types.js";

/** Callback type so the executor can recurse into the engine without a circular import. */
export type ExecuteActionsFn = (
  actions: CommandAction[],
  context: ExecutionContext,
) => Promise<void>;

export class ConditionalActionExecutor implements ActionExecutor<ConditionalAction> {
  readonly type = "conditional";

  constructor(
    private readonly prisma: PrismaClient,
    private readonly executeActions: ExecuteActionsFn,
  ) {}

  async execute(action: ConditionalAction, context: ExecutionContext): Promise<void> {
    const passed = await this.evaluate(action.condition, context);

    if (passed) {
      await this.executeActions(action.thenActions, context);
    } else {
      await this.executeActions(action.elseActions, context);
    }
  }

  private async evaluate(
    condition: ConditionClause,
    context: ExecutionContext,
  ): Promise<boolean> {
    switch (condition.type) {
      case "counter_check": {
        const counter = await this.prisma.counter.findUnique({
          where: { id: condition.counterId, tenantId: context.tenantId },
          select: { amount: true },
        });
        if (!counter) return false;
        return this.compare(counter.amount, condition.operator, condition.value);
      }

      case "currency_check": {
        const ledger = await this.prisma.currencyLedger.findUnique({
          where: {
            currencyId_userId: {
              currencyId: condition.currencyId,
              userId: context.triggerUserId,
            },
          },
          select: { amount: true },
        });
        const balance = ledger?.amount ?? 0;
        return this.compare(balance, condition.operator, condition.value);
      }

      case "role_check": {
        // Simplified role check: look for the role string in specialIdentifiers
        // A full implementation would query TenantUser roles from the platform
        const userRoles = context.specialIdentifiers["$roles"] ?? "";
        return userRoles
          .split(",")
          .map((r) => r.trim().toLowerCase())
          .includes(condition.role.toLowerCase());
      }

      default:
        console.warn(
          `[ConditionalActionExecutor] Unknown condition type: ${(condition as { type: string }).type}`,
        );
        return false;
    }
  }

  private compare(
    actual: number,
    operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte",
    expected: number,
  ): boolean {
    switch (operator) {
      case "eq":
        return actual === expected;
      case "neq":
        return actual !== expected;
      case "gt":
        return actual > expected;
      case "gte":
        return actual >= expected;
      case "lt":
        return actual < expected;
      case "lte":
        return actual <= expected;
      default:
        return false;
    }
  }
}
