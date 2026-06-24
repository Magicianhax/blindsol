"use client";

import Link from "next/link";
import { TOKEN_KINDS, tokenFor } from "@/lib/tokens";
import { TokenIcon } from "./token-icon";
import { useBadge } from "./badge-context";

export type SortKind = "hot" | "new" | "top";

/**
 * Sticky sub-bar: a horizontally scrollable strip of token rooms ("all" + every
 * community) and, on the feed, the hot/new/top sort. Rooms the user doesn't
 * hold a badge for show a lock glyph (reading is still open — only posting is
 * gated, by the composer). Matches the prototype's `.sub`.
 */
export function RoomNav({
  activeRoom,
  sort,
  onSort,
}: {
  activeRoom?: string;
  sort?: SortKind;
  onSort?: (s: SortKind) => void;
}) {
  const { badges } = useBadge();
  const held = new Set(badges.map((b) => b.kind));

  return (
    <nav className="sub">
      <div className="in">
        <div className="rooms">
          <Link className={`rl${!activeRoom ? " active" : ""}`} href="/forum">
            all
          </Link>
          {TOKEN_KINDS.map((kind) => {
            const meta = tokenFor(kind);
            const isHeld = held.has(kind);
            return (
              <Link
                key={kind}
                className={`rl${activeRoom === kind ? " active" : ""}${isHeld ? "" : " locked"}`}
                href={`/forum?room=${kind}`}
              >
                <TokenIcon kind={kind} size={14} className="shrink-0" />${meta?.symbol ?? kind}
                {!isHeld && <span className="lk">🔒</span>}
              </Link>
            );
          })}
        </div>

        {onSort && (
          <div className="sorts">
            {(["hot", "new", "top"] as const).map((s) => (
              <button
                key={s}
                className={`sl${sort === s ? " active" : ""}`}
                onClick={() => onSort(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
