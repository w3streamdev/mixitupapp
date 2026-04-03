import type { ActionExecutor } from "../action-executor.interface.js";
import type { WebRequestAction, ExecutionContext } from "../types.js";
import { resolveIdentifiers } from "../special-identifier-resolver.js";

export class WebRequestActionExecutor implements ActionExecutor<WebRequestAction> {
  readonly type = "web_request";

  async execute(action: WebRequestAction, context: ExecutionContext): Promise<void> {
    const url = resolveIdentifiers(action.url, context);
    const method = (action.method ?? "GET").toUpperCase();
    const responseKey = action.responseIdentifier ?? "$webrequest";

    try {
      const headers: Record<string, string> = {
        ...(action.headers ?? {}),
      };

      const fetchInit: RequestInit = {
        method,
        headers,
        signal: AbortSignal.timeout(10_000),
      };

      if (action.body && method !== "GET" && method !== "HEAD") {
        fetchInit.body = resolveIdentifiers(action.body, context);
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
      }

      const response = await fetch(url, fetchInit);
      const text = await response.text();

      context.specialIdentifiers[responseKey] = text;
    } catch (err) {
      console.error(
        `[WebRequestActionExecutor] Request to ${url} failed:`,
        err instanceof Error ? err.message : err,
      );
      context.specialIdentifiers[responseKey] = "";
    }
  }
}
