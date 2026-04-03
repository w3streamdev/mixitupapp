import type { ActionExecutor } from "../action-executor.interface.js";
import type { ChatAction, ExecutionContext } from "../types.js";
import { resolveIdentifiers } from "../special-identifier-resolver.js";

export type SendMessageFn = (channel: string, platform: string, message: string, tenantId: string) => Promise<void>;

export class ChatActionExecutor implements ActionExecutor<ChatAction> {
  readonly type = "chat";

  constructor(private readonly sendMessage: SendMessageFn) {}

  async execute(action: ChatAction, context: ExecutionContext): Promise<void> {
    const resolved = resolveIdentifiers(action.message, context);
    const platform = action.platform ?? context.platform;
    const channel = context.specialIdentifiers["$channel"] ?? "";

    try {
      await this.sendMessage(channel, platform, resolved, context.tenantId);
    } catch (err) {
      console.error(
        `[ChatActionExecutor] Failed to send message for tenant ${context.tenantId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
