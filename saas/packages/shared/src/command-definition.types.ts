// ---------------------------------------------------------------------------
// Command Definition Type System
// ---------------------------------------------------------------------------

/** Top-level shape stored in the command `definition` JSON column. */
export interface CommandDefinition {
  triggers: ChatTrigger[];
  requirements: CommandRequirements;
  actions: CommandAction[];
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export interface ChatTrigger {
  text: string;
  isWildcard: boolean;
  caseSensitive: boolean;
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

export interface CurrencyCost {
  currencyId: string;
  amount: number;
}

export interface CommandRequirements {
  roles: string[];
  cooldownSeconds: number;
  userCooldownSeconds: number;
  currencyCost?: CurrencyCost;
}

// ---------------------------------------------------------------------------
// Actions — discriminated union on `type`
// ---------------------------------------------------------------------------

export interface ChatAction {
  type: "chat";
  message: string;
  platform?: string;
  sendAsReply: boolean;
}

export interface WaitAction {
  type: "wait";
  durationMs: number;
}

export interface ConditionalAction {
  type: "conditional";
  condition: ConditionalClause;
  thenActions: CommandAction[];
  elseActions: CommandAction[];
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
  targetUserId?: string;
}

export interface WebRequestAction {
  type: "web_request";
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  responseIdentifier?: string;
}

export interface SoundAction {
  type: "sound";
  soundUrl: string;
  volume: number;
}

export interface OverlayAction {
  type: "overlay";
  overlayId: string;
  data?: Record<string, unknown>;
}

export type CommandAction =
  | ChatAction
  | WaitAction
  | ConditionalAction
  | CommandRefAction
  | CounterAction
  | CurrencyAction
  | WebRequestAction
  | SoundAction
  | OverlayAction;

// ---------------------------------------------------------------------------
// Conditional Clause
// ---------------------------------------------------------------------------

export interface ConditionalClause {
  type: "counter_check" | "currency_check" | "role_check" | "custom";
  operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains";
  field: string;
  value: string | number;
}
