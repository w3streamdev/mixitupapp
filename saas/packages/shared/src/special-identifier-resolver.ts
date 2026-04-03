import type { ExecutionContext } from "./execution-context.js";

// ---------------------------------------------------------------------------
// Built-in identifier map (lazy — built per call)
// ---------------------------------------------------------------------------

function builtinIdentifiers(ctx: ExecutionContext): Record<string, string> {
  const now = new Date();

  return {
    username: ctx.triggerUsername,
    userid: ctx.triggerUserId,
    userdisplayname: ctx.triggerDisplayName,
    message: ctx.message,
    allargs: ctx.arguments.join(" "),
    argcount: String(ctx.arguments.length),
    date: now.toLocaleDateString("en-US"),
    time: now.toLocaleTimeString("en-US"),
    datetime: now.toLocaleString("en-US"),
    randomnumber: String(Math.floor(Math.random() * 100) + 1),
  };
}

// Matches $identifier patterns — identifiers consist of word characters only.
const IDENTIFIER_REGEX = /\$([a-zA-Z_]\w*)/g;

/**
 * Resolves all `$identifier` patterns inside {@link template} using values
 * derived from the {@link ExecutionContext}.
 *
 * Resolution order:
 * 1. Numbered args (`$args1` … `$args9`)
 * 2. `$randomnumberN` — random integer between 1 and N
 * 3. Built-in identifiers (e.g. `$username`, `$allargs`)
 * 4. `context.specialIdentifiers` map
 * 5. Unknown identifiers are left as-is.
 */
export function resolveSpecialIdentifiers(
  template: string,
  ctx: ExecutionContext,
): string {
  const builtins = builtinIdentifiers(ctx);

  return template.replace(IDENTIFIER_REGEX, (match, name: string) => {
    const lower = name.toLowerCase();

    // $args1 … $args9
    const argsMatch = /^args(\d)$/.exec(lower);
    if (argsMatch) {
      const idx = Number(argsMatch[1]) - 1;
      return idx >= 0 && idx < ctx.arguments.length
        ? ctx.arguments[idx]!
        : match;
    }

    // $randomnumberN — e.g. $randomnumber500
    const rngMatch = /^randomnumber(\d+)$/.exec(lower);
    if (rngMatch) {
      const max = Number(rngMatch[1]);
      if (max > 0) {
        return String(Math.floor(Math.random() * max) + 1);
      }
      return match;
    }

    // Built-in identifiers
    if (lower in builtins) {
      return builtins[lower]!;
    }

    // Custom special identifiers from context
    if (name in ctx.specialIdentifiers) {
      return ctx.specialIdentifiers[name]!;
    }
    if (lower in ctx.specialIdentifiers) {
      return ctx.specialIdentifiers[lower]!;
    }

    // Unknown — leave as-is
    return match;
  });
}
