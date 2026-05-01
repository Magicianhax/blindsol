import { pgTable, uuid, text, timestamp, bigint, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Badges issued by the TEE after verifying a holdings or employment claim.
 * Notice: NO wallet column. The wallet ↔ badge link only exists inside PER.
 */
export const badges = pgTable("badges", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(), // 'jup_holder' | 'sol_foundation' | 'anthropic_eng' | etc.
  onChainPubkey: text("on_chain_pubkey").notNull(), // badge NFT mint on Solana
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reactionKind = pgEnum("reaction_kind", ["up", "down", "spam"]);

/**
 * Anonymous posts. Authored by a TEE-derived anon_id, never by a wallet.
 */
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorAnonId: text("author_anon_id").notNull(),
    badgeKind: text("badge_kind").notNull(), // denormalized for cheap reads
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(), // SHA-256 of content, anchored on-chain
    perAttestation: text("per_attestation").notNull(), // TEE signature over (post_id, anon_id, content_hash)
    stakeLamports: bigint("stake_lamports", { mode: "bigint" }).notNull().default(0n),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_posts_author_anon").on(t.authorAnonId),
    index("idx_posts_badge_created").on(t.badgeKind, t.createdAt),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_comments_post").on(t.postId, t.createdAt),
    index("idx_comments_parent").on(t.parentId),
  ],
);

/**
 * Reactions: upvote / downvote / spam-flag. Unique per (post, anon, kind).
 */
export const reactions = pgTable(
  "reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    reactorAnonId: text("reactor_anon_id").notNull(),
    kind: reactionKind("kind").notNull(),
    perAttestation: text("per_attestation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_reactions_post_anon_kind").on(t.postId, t.reactorAnonId, t.kind),
    index("idx_reactions_post").on(t.postId),
  ],
);

export const postsRelations = relations(posts, ({ many }) => ({
  comments: many(comments),
  reactions: many(reactions),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
}));

export const reactionsRelations = relations(reactions, ({ one }) => ({
  post: one(posts, { fields: [reactions.postId], references: [posts.id] }),
}));

export type Badge = typeof badges.$inferSelect;
export type NewBadge = typeof badges.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type Reaction = typeof reactions.$inferSelect;
export type NewReaction = typeof reactions.$inferInsert;
