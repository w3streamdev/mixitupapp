import type { TriggerType } from "./execution-context.js";

// ---------------------------------------------------------------------------
// Pub/Sub Message Types
// ---------------------------------------------------------------------------

/** Message published when a command execution is requested. */
export interface CommandRunMessage {
  tenantId: string;
  commandId: string;
  executionId: string;
  triggerType: TriggerType;
  platform: string;
  userId: string;
  username: string;
  displayName: string;
  message: string;
  arguments: string[];
  specialIdentifiers: Record<string, string>;
  isTestRun: boolean;
  /** ISO-8601 timestamp */
  timestamp: string;
}
