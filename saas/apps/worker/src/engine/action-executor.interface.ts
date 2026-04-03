import type { ExecutionContext } from "./types.js";

export interface ActionExecutor<T = unknown> {
  readonly type: string;
  execute(action: T, context: ExecutionContext): Promise<void>;
}
