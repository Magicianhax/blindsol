import type { Post } from "./api";

/** Net vote score: upvotes minus downvotes (missing counts treated as 0). */
export function netScore(item: { upCount?: number; downCount?: number }): number {
  return (item.upCount ?? 0) - (item.downCount ?? 0);
}

/**
 * Hacker-News-style "hot" rank: net score decayed by age, so fresh posts with
 * a few votes can out-rank older highly-voted ones. Higher is hotter.
 */
export function hotScore(post: Post): number {
  const hours = (Date.now() - new Date(post.createdAt).getTime()) / 3.6e6;
  return (netScore(post) + 1) / Math.pow(hours + 2, 1.4);
}
