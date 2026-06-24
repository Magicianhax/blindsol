/** Shared presentation helpers for the forum views. */

/** Compact relative time, e.g. "just now", "5m", "3h", "2d", "4mo", "1y". */
export function timeAgo(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 45) return "just now";
  if (s < 90) return "1m";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  const d = Math.floor(h / 24);
  if (d < 30) return d + "d";
  const mo = Math.floor(d / 30);
  if (mo < 12) return mo + "mo";
  return Math.floor(mo / 12) + "y";
}

/** Fallback headline for legacy posts with no title column. */
export function deriveTitle(content: string): string {
  const firstLine =
    String(content)
      .split("\n")
      .map((s) => s.trim())
      .find(Boolean) ?? "";
  if (firstLine.length <= 90) return firstLine;
  return firstLine.slice(0, 87).trimEnd() + "…";
}

/** Split prose into paragraph blocks (blank-line separated). */
export function paragraphs(body: string): string[] {
  return String(body)
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Title + body for a post. Prefers the dedicated `title` column; legacy rows
 * without one derive a headline from the first line of the content.
 */
export function titleAndBody(post: { title: string | null; content: string }): {
  title: string;
  body: string;
} {
  if (post.title) return { title: post.title, body: post.content };
  const trimmed = post.content.trim();
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline > 0 && firstNewline < 200) {
    return { title: trimmed.slice(0, firstNewline).trim(), body: trimmed.slice(firstNewline + 1).trim() };
  }
  if (trimmed.length <= 160) return { title: trimmed, body: "" };
  return { title: "", body: trimmed };
}
