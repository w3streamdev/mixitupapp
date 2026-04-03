// ---------------------------------------------------------------------------
// Runtime Execution Context
// ---------------------------------------------------------------------------

export type TriggerType =
  | "chat"
  | "api"
  | "test"
  | "event"
  | "timer"
  | "command_ref";

export interface ExecutionContext {
  tenantId: string;
  commandId: string;
  executionId: string;
  platform: string;
  triggerType: TriggerType;
  triggerUserId: string;
  triggerUsername: string;
  triggerDisplayName: string;
  message: string;
  arguments: string[];
  specialIdentifiers: Record<string, string>;
  isTestRun: boolean;
  /** Recursion depth tracker — starts at 0. */
  depth: number;
}
