import type { ActionExecutor } from "./action-executor.interface.js";

export class ExecutorRegistry {
  private readonly executors = new Map<string, ActionExecutor>();

  register(executor: ActionExecutor): void {
    this.executors.set(executor.type, executor);
  }

  get(type: string): ActionExecutor | undefined {
    return this.executors.get(type);
  }
}
