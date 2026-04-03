import type { ActionExecutor } from "../action-executor.interface.js";
import type { WaitAction, ExecutionContext } from "../types.js";

/** Maximum wait time in ms — keeps us safely within Pub/Sub ack deadline. */
const MAX_WAIT_MS = 25_000;

export class WaitActionExecutor implements ActionExecutor<WaitAction> {
  readonly type = "wait";

  async execute(action: WaitAction, _context: ExecutionContext): Promise<void> {
    const duration = Math.min(Math.max(action.durationMs, 0), MAX_WAIT_MS);
    await new Promise((resolve) => setTimeout(resolve, duration));
  }
}
