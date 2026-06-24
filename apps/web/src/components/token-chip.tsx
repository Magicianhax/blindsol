"use client";

import type { CSSProperties } from "react";
import { tokenFor } from "@/lib/tokens";
import { TokenIcon } from "./token-icon";

/**
 * Inline token chip — the real token logo + `$SYMBOL`, matching the prototype's
 * `.tok` element. `locked` adds a lock glyph. Falls back to a colored initial
 * coin (via TokenIcon) when the logo image can't load.
 */
export function TokenChip({
  kind,
  locked = false,
  className,
}: {
  kind: string;
  locked?: boolean;
  className?: string;
}) {
  const meta = tokenFor(kind);
  const cls = `tok${className ? " " + className : ""}`;
  if (!meta) {
    return <span className={cls}>#{kind}</span>;
  }
  return (
    <span className={cls} style={{ "--tc": meta.color } as CSSProperties}>
      <TokenIcon kind={kind} size={15} className="shrink-0" />${meta.symbol}
      {locked && <span className="lk">🔒</span>}
    </span>
  );
}
