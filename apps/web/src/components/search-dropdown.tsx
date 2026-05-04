"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Post } from "@/lib/api";
import { TOKEN_KINDS, TOKENS, tokenFor } from "@/lib/tokens";
import { TokenIcon } from "./token-icon";

interface ResultGroup {
  label: string;
  items: ResultItem[];
}

type ResultItem =
  | { kind: "token"; href: string; ticker: string; name: string; tokenKind: string }
  | { kind: "thread"; href: string; title: string; badgeKind: string; authorAnonId: string }
  | { kind: "handle"; href: string; handle: string };

/**
 * Top-nav search with a dropdown of suggestions. Three result groups:
 *   - tokens: filtered against the static TOKENS table (instant, no fetch)
 *   - threads: filtered client-side against a single cached fetch of /posts
 *   - handles: shown as a "go to @<handle>" result whenever the query
 *     matches the username regex, lets users jump to a profile by name
 *     without a server-side username search endpoint
 *
 * Keyboard: ↑/↓ to navigate, Enter to open the highlighted result,
 * Escape to close. Outside click also closes.
 */
export function SearchDropdown() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Lazy-load /posts the first time the user opens the dropdown. After that
  // we re-use the cached list for client-side filtering. ~3-50 posts at
  // current scale; cheap enough to avoid building a server-side search index.
  useEffect(() => {
    if (!open || posts !== null || loadingPosts) return;
    let cancelled = false;
    setLoadingPosts(true);
    api
      .listPosts(undefined, 100)
      .then((r) => {
        if (!cancelled) setPosts(r.posts);
      })
      .catch(() => {
        if (!cancelled) setPosts([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPosts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, posts, loadingPosts]);

  // Outside click + escape to close.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const groups = useMemo(() => buildGroups(query, posts), [query, posts]);
  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Reset highlight whenever the result set changes shape.
  useEffect(() => {
    setHighlight(0);
  }, [flatItems.length, query]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(flatItems.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatItems[highlight];
      if (item) {
        router.push(item.href);
        setOpen(false);
        setQuery("");
      }
    }
  };

  // Compute a global flat index per group item so we can highlight one row
  // across multiple groups without resetting per group.
  let cursor = 0;

  const showDropdown = open && (query.trim().length > 0 || groups.length > 0);

  return (
    <div ref={wrapRef} className="relative w-full">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2">
        <SearchIcon />
      </span>
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="search threads, $TICKER, @handle"
        className="scribble-input w-full"
        style={{ paddingLeft: 36, fontSize: 12 }}
        aria-haspopup="listbox"
        aria-expanded={showDropdown}
      />

      {showDropdown && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-[420px] overflow-y-auto rounded-md border border-line bg-bg-2 shadow-2xl"
        >
          {flatItems.length === 0 ? (
            <div className="px-4 py-6 text-center font-mono text-[12px] text-muted">
              {query.trim()
                ? loadingPosts
                  ? "searching…"
                  : "nothing matched. try a different word."
                : "type to search threads, $TICKER, or @handle."}
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.label} className="border-b border-line last:border-b-0">
                <header className="px-3 pt-2 pb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                  {group.label}
                </header>
                <ul>
                  {group.items.map((item) => {
                    const idx = cursor++;
                    const active = idx === highlight;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => {
                            setOpen(false);
                            setQuery("");
                          }}
                          onMouseEnter={() => setHighlight(idx)}
                          className={`flex items-center gap-2.5 px-3 py-2 transition ${
                            active ? "bg-bg-3 text-acid" : "text-text-2 hover:bg-bg-3 hover:text-text"
                          }`}
                        >
                          <ResultRow item={item} active={active} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({ item, active }: { item: ResultItem; active: boolean }) {
  if (item.kind === "token") {
    return (
      <>
        <TokenIcon kind={item.tokenKind} size={20} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className={`font-mono text-[13px] ${active ? "text-acid" : "text-text"}`}>
            ${item.ticker}
          </div>
          <div className="truncate font-mono text-[10px] text-muted">{item.name}</div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-2">token</span>
      </>
    );
  }
  if (item.kind === "thread") {
    const meta = tokenFor(item.badgeKind);
    return (
      <>
        <TokenIcon kind={item.badgeKind} size={20} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-mono text-[13px]">{item.title}</div>
          <div className="font-mono text-[10px] text-muted">
            ${meta?.symbol ?? item.badgeKind} · {item.authorAnonId.slice(0, 12)}…
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-2">thread</span>
      </>
    );
  }
  return (
    <>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-muted">
        <UserIcon />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className={`font-mono text-[13px] ${active ? "text-acid" : "text-text"}`}>
          @{item.handle}
        </div>
        <div className="font-mono text-[10px] text-muted">open profile</div>
      </div>
      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-2">handle</span>
    </>
  );
}

const HANDLE_RX = /^@?([a-z0-9][a-z0-9_]{2,19})$/i;

function buildGroups(query: string, posts: Post[] | null): ResultGroup[] {
  const q = query.trim().toLowerCase().replace(/^[$#]/, "");
  if (!q) return [];

  const out: ResultGroup[] = [];

  // Tokens — match ticker prefix (cheapest).
  const tokenMatches = TOKEN_KINDS.filter((kind) => {
    const meta = TOKENS[kind]!;
    return meta.symbol.toLowerCase().startsWith(q) || kind.includes(q);
  })
    .slice(0, 5)
    .map<ResultItem>((kind) => ({
      kind: "token",
      href: `/?filter=${kind}`,
      ticker: TOKENS[kind]!.symbol,
      name: TOKENS[kind]!.label.replace("verified $", "").replace(" holder", " holder"),
      tokenKind: kind,
    }));
  if (tokenMatches.length) out.push({ label: "tokens", items: tokenMatches });

  // Threads — title or content includes the query.
  if (posts && posts.length > 0) {
    const threadMatches = posts
      .filter((p) => {
        const title = (p.title ?? "").toLowerCase();
        const body = p.content.toLowerCase();
        return title.includes(q) || body.includes(q);
      })
      .slice(0, 6)
      .map<ResultItem>((p) => ({
        kind: "thread",
        href: `/post/${p.id}`,
        title: p.title || p.content.split("\n")[0] || "(untitled)",
        badgeKind: p.badgeKind,
        authorAnonId: p.authorAnonId,
      }));
    if (threadMatches.length) out.push({ label: "threads", items: threadMatches });
  }

  // Handle — show "go to @<query>" if it parses as a valid handle. We
  // don't have a fuzzy username search endpoint, so this is a deterministic
  // shortcut: type `meow` or `@meow` → navigates to /u/meow on enter.
  const m = q.match(HANDLE_RX);
  if (m) {
    out.push({
      label: "handle",
      items: [
        {
          kind: "handle",
          href: `/u/${m[1]!.toLowerCase()}`,
          handle: m[1]!.toLowerCase(),
        },
      ],
    });
  }

  return out;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" strokeLinecap="round" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="6" r="2.5" />
      <path d="M3 14 Q3 9.5 8 9.5 Q13 9.5 13 14" strokeLinecap="round" />
    </svg>
  );
}
