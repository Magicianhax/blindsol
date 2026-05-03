const API_BASE = "/api";

export interface Post {
  id: string;
  authorAnonId: string;
  badgeKind: string;
  /** Thread headline. Nullable for legacy rows posted before the title column. */
  title: string | null;
  content: string;
  contentHash: string;
  perAttestation: string;
  stakeLamports: string;
  createdAt: string;
  upCount?: number;
  downCount?: number;
  commentCount?: number;
}

export interface Comment {
  id: string;
  postId: string;
  parentId: string | null;
  authorAnonId: string;
  badgeKind: string;
  content: string;
  perAttestation: string;
  createdAt: string;
  upCount?: number;
  downCount?: number;
  replyCount?: number;
}

export interface Reaction {
  id: string;
  postId: string | null;
  commentId: string | null;
  reactorAnonId: string;
  kind: "up" | "down" | "spam";
  perAttestation: string;
  createdAt: string;
}

export interface ClaimResponse {
  badgeId: string;
  kind: string;
  label: string;
  onChainPubkey: string;
  badgeToken: string;
  expiresAt: number;
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly body: unknown, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {}
    const msg = (body as { reason?: string; error?: string } | null)?.reason
      ?? (body as { error?: string } | null)?.error
      ?? `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, body, msg);
  }
  return (await res.json()) as T;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export const api = {
  health: () => request<{ ok: boolean; service: string }>("/health"),

  getChallenge: (wallet: string) =>
    request<{ challenge: string }>(`/badges/challenge?wallet=${encodeURIComponent(wallet)}`),

  claim: (body: { wallet: string; kind: string; challenge: string; signature: string }) =>
    request<ClaimResponse>("/badges/claim", { method: "POST", body: JSON.stringify(body) }),

  listPosts: (badge?: string, limit = 50) => {
    const qs = new URLSearchParams();
    if (badge) qs.set("badge", badge);
    qs.set("limit", String(limit));
    return request<{ posts: Post[] }>(`/posts?${qs.toString()}`);
  },

  getPost: (id: string) =>
    request<{ post: Post; comments: Comment[]; reactions: Reaction[] }>(`/posts/${id}`),

  preparePost: (token: string, args: { title: string; content: string; fromWallet: string }) =>
    request<{
      postId: string;
      title: string;
      content: string;
      contentHash: string;
      stakeBond: {
        postId: string;
        contentHash: string;
        memo: string;
        expectedAmountRaw: string;
        expectedRecipient: string;
        unsignedTransactionBase64: string;
        recentBlockhash: string;
        lastValidBlockHeight: number;
        requiredSigners: string[];
        validator: string;
        receipt: string;
        expiresAt: number;
      };
    }>("/posts/prepare", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(args),
    }),

  finalizePost: (token: string, args: { receipt: string; txSignature: string; title: string; content: string }) =>
    request<{ post: Post; stakeTxSignature: string }>("/posts/finalize", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(args),
    }),

  createComment: (token: string, postId: string, content: string, parentId?: string) =>
    request<{ comment: Comment }>(`/posts/${postId}/comments`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ content, ...(parentId ? { parentId } : {}) }),
    }),

  react: (token: string, postId: string, kind: "up" | "down" | "spam") =>
    request<{ reaction: Reaction; created: boolean }>(`/posts/${postId}/reactions`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ kind }),
    }),

  reactComment: (token: string, commentId: string, kind: "up" | "down" | "spam") =>
    request<{ reaction: Reaction; created: boolean }>(`/posts/comments/${commentId}/reactions`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ kind }),
    }),
};

export const BADGE_LABELS: Record<string, string> = {
  jup_holder: "verified $JUP holder",
  drift_holder: "verified $DRIFT holder",
  kmno_holder: "verified $KMNO holder",
  ray_holder: "verified $RAY holder",
  orca_holder: "verified $ORCA holder",
  tnsr_holder: "verified $TNSR holder",
  bonk_holder: "verified $BONK holder",
  wif_holder: "verified $WIF holder",
  popcat_holder: "verified $POPCAT holder",
  mew_holder: "verified $MEW holder",
  pyth_holder: "verified $PYTH holder",
  hnt_holder: "verified $HNT holder",
  rndr_holder: "verified $RNDR holder",
};
