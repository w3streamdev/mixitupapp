// ─── Execution Context ─────────────────────────────────────────────────────

export interface ExecutionContext {
  tenantId: string;
  commandId: string;
  executionId: string;
  platform: string;
  triggerType: string;
  triggerUserId: string;
  triggerUsername: string;
  triggerDisplayName: string;
  message: string;
  arguments: string[];
  specialIdentifiers: Record<string, string>;
  isTestRun: boolean;
  depth: number;
}

// ─── Command Definition ────────────────────────────────────────────────────

export interface ChatTrigger {
  commands: string[];
  includeExclamation: boolean;
  caseSensitive: boolean;
  wildcards: boolean;
}

export interface CommandRequirements {
  roles?: string[];
  cooldownSeconds?: number;
  userCooldownSeconds?: number;
  currencyId?: string;
  currencyCost?: number;
}

export interface EventTriggerConfig {
  eventType: string;
  platform?: string;
  // Bits-specific
  bitsAmount?: number;
  bitsMin?: number;
  bitsMax?: number;
  // Channel points
  rewardName?: string;
  rewardId?: string;
}

export interface TimerConfig {
  intervalSeconds: number;
  minChatMessages: number;
  groupName?: string;
  groupIntervalSeconds?: number;
}

export interface CommandDefinition {
  triggers?: ChatTrigger;
  requirements?: CommandRequirements;
  actions: CommandAction[];
  event?: EventTriggerConfig;
  timer?: TimerConfig;
}

// ─── Actions ───────────────────────────────────────────────────────────────

export type CommandAction =
  | ChatAction
  | WaitAction
  | ConditionalAction
  | CommandRefAction
  | CounterAction
  | CurrencyAction
  | WebRequestAction;

export interface ChatAction {
  type: "chat";
  message: string;
  sendAsStreamer?: boolean;
  platform?: string;
}

export interface WaitAction {
  type: "wait";
  durationMs: number;
}

export interface ConditionalAction {
  type: "conditional";
  condition: ConditionClause;
  thenActions: CommandAction[];
  elseActions: CommandAction[];
}

export type ConditionClause =
  | CounterCheckCondition
  | CurrencyCheckCondition
  | RoleCheckCondition;

export interface CounterCheckCondition {
  type: "counter_check";
  counterId: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
  value: number;
}

export interface CurrencyCheckCondition {
  type: "currency_check";
  currencyId: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
  value: number;
}

export interface RoleCheckCondition {
  type: "role_check";
  role: string;
}

export interface CommandRefAction {
  type: "command_ref";
  commandId: string;
}

export interface CounterAction {
  type: "counter";
  counterId: string;
  operation: "increment" | "decrement" | "set" | "reset";
  amount?: number;
}

export interface CurrencyAction {
  type: "currency";
  currencyId: string;
  operation: "give" | "take";
  amount: number;
}

export interface WebRequestAction {
  type: "web_request";
  url: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  responseIdentifier?: string;
}

// ─── Pub/Sub Message ───────────────────────────────────────────────────────

export interface CommandRunMessage {
  tenantId: string;
  commandId: string;
  executionId: string;
  triggerType: string;
  platform: string;
  userId: string;
  username: string;
  displayName: string;
  message: string;
  arguments: string[];
  specialIdentifiers: Record<string, string>;
  isTestRun: boolean;
  timestamp: string;
}
