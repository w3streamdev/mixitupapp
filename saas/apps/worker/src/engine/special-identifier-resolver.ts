import type { ExecutionContext } from "./types.js";

const RANDOM_NUMBER_PATTERN = /\$randomnumber(\d+)/gi;

export function resolveIdentifiers(template: string, context: ExecutionContext): string {
  let result = template;

  // Built-in identifiers
  result = result.replace(/\$username/gi, context.triggerUsername);
  result = result.replace(/\$userid/gi, context.triggerUserId);
  result = result.replace(/\$userdisplayname/gi, context.triggerDisplayName);
  result = result.replace(/\$message/gi, context.message);
  const args = context.arguments ?? [];
  result = result.replace(/\$allargs/gi, args.join(" "));
  result = result.replace(/\$argcount/gi, String(args.length));

  // Positional arguments $args1 through $args9 (and $arg1-9 as aliases)
  for (let i = 1; i <= 9; i++) {
    const pattern = new RegExp(`\\$args?${i}`, "gi");
    result = result.replace(pattern, args[i - 1] ?? "");
  }

  // Date/time identifiers
  const now = new Date();
  result = result.replace(/\$datetime/gi, now.toISOString());
  result = result.replace(/\$date/gi, now.toISOString().split("T")[0]!);
  result = result.replace(/\$time/gi, now.toTimeString().split(" ")[0]!);

  // $randomnumberN — random integer from 1 to N
  result = result.replace(RANDOM_NUMBER_PATTERN, (_match, maxStr: string) => {
    const max = parseInt(maxStr, 10);
    if (max <= 0 || isNaN(max)) return "0";
    return String(Math.floor(Math.random() * max) + 1);
  });

  // $randomnumber (no suffix) — 1 to 100
  result = result.replace(/\$randomnumber/gi, String(Math.floor(Math.random() * 100) + 1));

  // Context-provided special identifiers (e.g. $counter, $webrequest)
  for (const [key, value] of Object.entries(context.specialIdentifiers)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escapedKey, "gi");
    result = result.replace(pattern, value);
  }

  return result;
}
