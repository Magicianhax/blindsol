import { pgTable, uuid, text, timestamp, bigint, integer, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/**
 * Badges issued by the TEE after verifying token holdings.
 * Notice: NO wallet column. The wallet ↔ badge link only exists inside PER.
 *
 * `anon_id` is the deterministic per-(wallet,kind) anon identity derived
 * inside the TEE via HMAC. Storing it on the badge row lets sign-in look
 * up "all badges this wallet ever claimed" without ever persisting the
 * wallet itself: the server computes the candidate anon_ids and queries
 * `WHERE anon_id IN (...)`. UNIQUE so the same wallet+kind cannot mint
 * twice.
 */
export const badges = pgTable(
  "badges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    onChainPubkey: text("on_chain_pubkey").notNull(),
    /** Anchor program signature for the on-chain mint_badge call. */
    mintTxSignature: text("mint_tx_signature"),
    /** Deterministic anon. Nullable for legacy rows minted under random seeds. */
    anonId: text("anon_id"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_badges_anon").on(t.anonId).where(sql`${t.anonId} IS NOT NULL`),
  ],
);

/**
 * Single-use sign-in challenges. The server issues a fresh nonce, the user's
 * wallet signs it, and the server verifies the signature plus marks the
 * row consumed in one transaction.
 *
 * No wallet column — the challenge is wallet-agnostic until redeemed, and
 * even then we only learn the wallet long enough to derive the anon_id
 * inside the TEE.
 */
export const authChallenges = pgTable(
  "auth_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nonce: text("nonce").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_auth_challenges_nonce").on(t.nonce),
    index("idx_auth_challenges_expires").on(t.expiresAt),
  ],
);

export const reactionKind = pgEnum("reaction_kind", ["up", "down", "spam"]);

/**
 * Anonymous posts. Authored by a TEE-derived anon_id, never by a wallet.
 *
 * Forum-shaped: each post has a title (the thread heading) and a body
 * (`content`). Title is nullable for backwards compat with rows created
 * before we split the fields; new posts always supply both.
 */
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorAnonId: text("author_anon_id").notNull(),
    badgeKind: text("badge_kind").notNull(),
    /** Thread title — the headline shown in feed lists. Nullable for legacy rows. */
    title: text("title"),
    /** Thread body. Optional alongside a title. */
    content: text("content").notNull(),
    /** sha256 over `${title ?? ""}\n${content}`; binds the receipt at /finalize. */
    contentHash: text("content_hash").notNull(),
    perAttestation: text("per_attestation").notNull(),
    stakeLamports: bigint("stake_lamports", { mode: "bigint" }).notNull(),
    /** Denormalized counters; kept in sync by route handlers. Cheap reads. */
    upCount: integer("up_count").notNull().default(0),
    downCount: integer("down_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Soft delete — preserves attestation chain even after content removal. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_posts_author_anon").on(t.authorAnonId),
    index("idx_posts_badge_created").on(t.badgeKind, t.createdAt),
    index("idx_posts_created").on(t.createdAt),
  ],
);

/**
 * Server-side receipts for the prepare/finalize stake-bond pipeline.
 *
 * Privacy goal: the user's wallet must never travel back through the user
 * after /prepare. The previous design returned a signed receipt blob that
 * embedded `fromWallet` in plaintext base64 — anyone holding that blob (a
 * compromised browser, a malicious extension, a logging proxy) could pull
 * the wallet out. Now /prepare stores the wallet here, returns only the
 * row id (uuid) as the opaque receipt, and /finalize looks up the row.
 *
 * `consumed_at` prevents replay: once /finalize succeeds the row is marked
 * consumed, so the same prepare cannot be redeemed twice.
 */
export const preparedStakeBonds = pgTable(
  "prepared_stake_bonds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").notNull().unique(),
    /** Stays in the DB; never returned to clients. */
    fromWallet: text("from_wallet").notNull(),
    contentHash: text("content_hash").notNull(),
    expectedAmountRaw: text("expected_amount_raw").notNull(),
    expectedRecipient: text("expected_recipient").notNull(),
    /** HMAC-derived memo string. Server compares against on-chain memo. */
    memo: text("memo").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_prep_expires").on(t.expiresAt),
  ],
);

/**
 * Optional public handle for an anon_id. Lets users pick a memorable
 * "@whaleboy420"-style display name without surrendering the wallet ↔
 * anon mapping (which still lives in the TEE only).
 *
 * Keyed by `anonId`, never by wallet — so the privacy chain stays:
 *   wallet  ──[TEE]──►  anon_id  ──[server-side]──►  username
 *
 * `UNIQUE(anon_id)`: an anon can hold one name at a time. Same wallet
 * with $JUP and $BONK badges has two anon_ids and can pick two names —
 * the multi-badge unlinkability is preserved (no shared display layer
 * collapses the two identities back together).
 */
export const usernames = pgTable(
  "usernames",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Lowercased canonical handle. Display in UI uses this as-is. */
    username: text("username").notNull(),
    anonId: text("anon_id").notNull(),
    badgeKind: text("badge_kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_usernames_username").on(t.username),
    uniqueIndex("uq_usernames_anon").on(t.anonId),
    index("idx_usernames_badge").on(t.badgeKind),
  ],
);

/**
 * Threaded comments on posts. Same anon mechanism as posts.
 */
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    authorAnonId: text("author_anon_id").notNull(),
    badgeKind: text("badge_kind").notNull(),
    content: text("content").notNull(),
    perAttestation: text("per_attestation").notNull(),
    upCount: integer("up_count").notNull().default(0),
    downCount: integer("down_count").notNull().default(0),
    replyCount: integer("reply_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_comments_post").on(t.postId, t.createdAt),
    index("idx_comments_parent").on(t.parentId),
  ],
);

/**
 * Reactions: upvote / downvote / spam-flag for posts AND comments.
 *
 * Polymorphic via two nullable FKs — exactly one of `post_id` or `comment_id`
 * is set per row (enforced by a CHECK constraint added in the migration).
 * Two partial unique indexes prevent the same anon from reacting twice with
 * the same kind to the same subject.
 */
export const reactions = pgTable(
  "reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    reactorAnonId: text("reactor_anon_id").notNull(),
    kind: reactionKind("kind").notNull(),
    perAttestation: text("per_attestation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_reactions_post").on(t.postId),
    index("idx_reactions_comment").on(t.commentId),
    uniqueIndex("uq_reactions_post_anon_kind")
      .on(t.postId, t.reactorAnonId, t.kind)
      .where(sql`${t.postId} IS NOT NULL`),
    uniqueIndex("uq_reactions_comment_anon_kind")
      .on(t.commentId, t.reactorAnonId, t.kind)
      .where(sql`${t.commentId} IS NOT NULL`),
  ],
);

/**
 * Spam / moderation flags submitted by users. Distinct from reactions so we
 * can attach a reason and a resolution state.
 */
export const flagStatus = pgEnum("flag_status", ["open", "dismissed", "actioned"]);

export const flags = pgTable(
  "flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    flaggerAnonId: text("flagger_anon_id").notNull(),
    reason: text("reason").notNull(),
    status: flagStatus("status").notNull().default("open"),
    perAttestation: text("per_attestation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_flags_post").on(t.postId),
    index("idx_flags_comment").on(t.commentId),
    index("idx_flags_status").on(t.status),
  ],
);

/**
 * Audit log of every state-changing API action. Append-only; useful for
 * debugging, analytics, and proving moderation actions to disputed users.
 */
export const auditEventKind = pgEnum("audit_event_kind", [
  "badge_issued",
  "post_created",
  "comment_created",
  "reaction_created",
  "flag_created",
  "post_deleted",
]);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: auditEventKind("kind").notNull(),
    /** The thing that changed (post id, comment id, badge id, etc). */
    subjectId: text("subject_id").notNull(),
    /** Anon id of the actor when known; null for system events. */
    actorAnonId: text("actor_anon_id"),
    badgeKind: text("badge_kind"),
    /** Free-form metadata: tx signatures, content hash, reason codes. */
    meta: text("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_audit_kind_created").on(t.kind, t.createdAt),
    index("idx_audit_subject").on(t.subjectId),
  ],
);

// ─── Relations ──────────────────────────────────────────────────────

export const postsRelations = relations(posts, ({ many }) => ({
  comments: many(comments),
  reactions: many(reactions),
  flags: many(flags),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  reactions: many(reactions),
  flags: many(flags),
}));

export const reactionsRelations = relations(reactions, ({ one }) => ({
  post: one(posts, { fields: [reactions.postId], references: [posts.id] }),
  comment: one(comments, { fields: [reactions.commentId], references: [comments.id] }),
}));

export const flagsRelations = relations(flags, ({ one }) => ({
  post: one(posts, { fields: [flags.postId], references: [posts.id] }),
  comment: one(comments, { fields: [flags.commentId], references: [comments.id] }),
}));

// ─── Types ──────────────────────────────────────────────────────────

export type Badge = typeof badges.$inferSelect;
export type NewBadge = typeof badges.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type Reaction = typeof reactions.$inferSelect;
export type NewReaction = typeof reactions.$inferInsert;
export type Flag = typeof flags.$inferSelect;
export type NewFlag = typeof flags.$inferInsert;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
export type PreparedStakeBondRow = typeof preparedStakeBonds.$inferSelect;
export type NewPreparedStakeBondRow = typeof preparedStakeBonds.$inferInsert;
export type Username = typeof usernames.$inferSelect;
export type NewUsername = typeof usernames.$inferInsert;
export type AuthChallenge = typeof authChallenges.$inferSelect;
export type NewAuthChallenge = typeof authChallenges.$inferInsert;
