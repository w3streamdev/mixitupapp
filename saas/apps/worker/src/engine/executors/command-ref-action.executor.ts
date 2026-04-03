import type { PrismaClient } from "@prisma/client";
import type { ActionExecutor } from "../action-executor.interface.js";
import type {
  CommandRefAction,
  CommandDefinition,
  CommandAction,
  ExecutionContext,
} from "../types.js";

const MAX_DEPTH = 5;

/** Callback type so the executor can recurse into the engine without a circular import. */
export type ExecuteActionsFn = (
  actions: CommandAction[],
  context: ExecutionContext,
) => Promise<void>;

export class CommandRefActionExecutor implements ActionExecutor<CommandRefAction> {
  readonly type = "command_ref";

  constructor(
    private readonly prisma: PrismaClient,
    private readonly executeActions: ExecuteActionsFn,
  ) {}

  async execute(action: CommandRefAction, context: ExecutionContext): Promise<void> {
    if (context.depth >= MAX_DEPTH) {
      console.warn(
        `[CommandRefActionExecutor] Max recursion depth (${MAX_DEPTH}) reached — skipping command ${action.commandId}`,
      );
      return;
    }

    const command = await this.prisma.command.findFirst({
      where: {
        id: action.commandId,
        tenantId: context.tenantId,
        isEnabled: true,
      },
    });

    if (!command) {
      console.warn(
        `[CommandRefActionExecutor] Referenced command ${action.commandId} not found or disabled`,
      );
      return;
    }

    const definition = command.definition as unknown as CommandDefinition;
    if (!definition?.actions?.length) {
      return;
    }

    const childContext: ExecutionContext = {
      ...context,
      commandId: command.id,
      depth: context.depth + 1,
    };

    await this.executeActions(definition.actions, childContext);
  }
}
