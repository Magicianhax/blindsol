import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../../.env") });

const { createApp } = await import("../../src/app.js");
const { getDb, closeDb, schema } = await import("../../src/db/index.js");

const haveDb = !!process.env.DATABASE_URL;
const describeIfDb = haveDb ? describe : describe.skip;

// Single shared DB / app across all tests in this file. The pool is closed
// once at the end via the file-level afterAll below.
const db = haveDb ? getDb() : (null as never);
// Dummy PER credentials — these tests only exercise read paths.
const dummySecret = haveDb ? new Uint8Array(64) : (null as never);
const app = haveDb
  ? createApp({ db, perPubkeyBase58: "1".repeat(32), perSecretKey: dummySecret })
  : (null as never);

afterAll(async () => {
  if (haveDb) await closeDb();
});

async function wipe(): Promise<void> {
  await db.delete(schema.reactions);
  await db.delete(schema.comments);
  await db.delete(schema.posts);
  await db.delete(schema.badges);
}

describeIfDb("GET /posts (integration, real DB)", () => {
  beforeAll(wipe);
  beforeEach(wipe);

  it("GET /health returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, service: "blindsol-api" });
  });

  it("GET /posts returns empty when no posts", async () => {
    const res = await request(app).get("/posts");
    expect(res.status).toBe(200);
    expect(res.body.posts).toEqual([]);
  });

  it("GET /posts returns posts ordered by created_at DESC", async () => {
    const inserted = await db
      .insert(schema.posts)
      .values([
        {
          authorAnonId: "anon_a",
          badgeKind: "jup_holder",
          content: "first post (older)",
          contentHash: "h1",
          perAttestation: "att1",
          stakeLamports: 100n,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          authorAnonId: "anon_b",
          badgeKind: "bonk_holder",
          content: "second post (newer)",
          contentHash: "h2",
          perAttestation: "att2",
          stakeLamports: 100n,
          createdAt: new Date("2026-02-01T00:00:00Z"),
        },
      ])
      .returning();

    expect(inserted.length).toBe(2);

    const res = await request(app).get("/posts");
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(2);
    expect(res.body.posts[0].content).toBe("second post (newer)");
    expect(res.body.posts[1].content).toBe("first post (older)");
  });

  it("GET /posts?badge=jup_holder filters by badge kind", async () => {
    await db.insert(schema.posts).values([
      {
        authorAnonId: "anon_a",
        badgeKind: "jup_holder",
        content: "jup post",
        contentHash: "h1",
        perAttestation: "att1",
        stakeLamports: 100n,
      },
      {
        authorAnonId: "anon_b",
        badgeKind: "bonk_holder",
        content: "anthropic post",
        contentHash: "h2",
        perAttestation: "att2",
        stakeLamports: 100n,
      },
    ]);

    const res = await request(app).get("/posts").query({ badge: "jup_holder" });
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].content).toBe("jup post");
  });

  it("GET /posts?limit=1 caps results", async () => {
    await db.insert(schema.posts).values([
      {
        authorAnonId: "anon_a",
        badgeKind: "jup_holder",
        content: "p1",
        contentHash: "h1",
        perAttestation: "att1",
        stakeLamports: 100n,
      },
      {
        authorAnonId: "anon_b",
        badgeKind: "jup_holder",
        content: "p2",
        contentHash: "h2",
        perAttestation: "att2",
        stakeLamports: 100n,
      },
    ]);

    const res = await request(app).get("/posts").query({ limit: 1 });
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(1);
  });
});

describeIfDb("GET /posts/:id (integration, real DB)", () => {
  beforeEach(wipe);

  it("returns 404 when post does not exist", async () => {
    const res = await request(app).get("/posts/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "post_not_found" });
  });

  it("returns the post with its comments and reactions", async () => {
    const [post] = await db
      .insert(schema.posts)
      .values({
        authorAnonId: "anon_a",
        badgeKind: "jup_holder",
        content: "main post",
        contentHash: "h1",
        perAttestation: "att1",
        stakeLamports: 100n,
      })
      .returning();
    if (!post) throw new Error("insert failed");

    await db.insert(schema.comments).values({
      postId: post.id,
      authorAnonId: "anon_b",
      badgeKind: "bonk_holder",
      content: "first reply",
      perAttestation: "att2",
    });
    await db.insert(schema.reactions).values({
      postId: post.id,
      reactorAnonId: "anon_c",
      kind: "up",
      perAttestation: "att3",
    });

    const res = await request(app).get(`/posts/${post.id}`);
    expect(res.status).toBe(200);
    expect(res.body.post.content).toBe("main post");
    expect(res.body.comments).toHaveLength(1);
    expect(res.body.comments[0].content).toBe("first reply");
    expect(res.body.reactions).toHaveLength(1);
    expect(res.body.reactions[0].kind).toBe("up");
  });
});
