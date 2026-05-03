import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { Keypair } from "@solana/web3.js";
import request from "supertest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../../.env") });

const { createApp } = await import("../../src/app.js");
const { getDb, closeDb, schema } = await import("../../src/db/index.js");
const { BadgeIssuer } = await import("../../src/per/issuer.js");
const { StubEvidenceVerifier } = await import("../../src/per/evidence.js");

const haveDb = !!process.env.DATABASE_URL;
const describeIfDb = haveDb ? describe : describe.skip;

function makeEnv() {
  const perKp = nacl.sign.keyPair();
  const perPubB58 = bs58.encode(perKp.publicKey);
  const db = getDb();
  const issuer = new BadgeIssuer({
    db,
    evidence: new StubEvidenceVerifier({ ok: true }),
    perSecretKey: perKp.secretKey,
    perPubkeyBase58: perPubB58,
  });
  const app = createApp({
    db,
    badgeIssuer: issuer,
    perPubkeyBase58: perPubB58,
    perSecretKey: perKp.secretKey,
  });
  return { db, app, perPubB58 };
}

async function claim(app: any, kind: "jup_holder" | "bonk_holder" = "jup_holder"): Promise<string> {
  const wallet = Keypair.generate();
  const challenge = `claim ${kind} ${Date.now()} ${Math.random()}`;
  const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(challenge), wallet.secretKey));
  const r = await request(app)
    .post("/badges/claim")
    .send({ wallet: wallet.publicKey.toBase58(), kind, challenge, signature: sig });
  if (r.status !== 201) throw new Error(`claim failed: ${r.status}`);
  return r.body.badgeToken as string;
}

// Inserts a post directly into the DB so comment/reaction tests don't depend
// on the (stake-gated) two-step post commit flow.
async function makePost(env: { db: any }, token: string, content = "parent post"): Promise<string> {
  const { schema } = await import("../../src/db/index.js");
  const { verifyBadgeToken } = await import("../../src/per/token.js");
  const { deriveAuthorAnonId, sha256Hex } = await import("../../src/per/anon.js");
  // Decode the badge token to derive the same anon_id the API would use, so
  // comment + post are linked under the same anonymous identity in tests
  // that assert on threading.
  const perPubkey = (env as any).perPubB58 ?? "1".repeat(32);
  let badgeKind = "jup_holder";
  let anonSeed = "0".repeat(64);
  try {
    const payload = verifyBadgeToken(token, perPubkey);
    badgeKind = payload.kind;
    anonSeed = payload.anonSeed;
  } catch {
    // fall back to defaults — caller must not assert on anon stability
  }
  const authorAnonId = deriveAuthorAnonId(anonSeed, badgeKind);
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();
  await env.db.insert(schema.posts).values({
    id,
    authorAnonId,
    badgeKind,
    content,
    contentHash: sha256Hex(content),
    perAttestation: "test-attestation",
    stakeLamports: 100_000n,
  });
  return id;
}

describeIfDb("POST /posts/:id/comments", () => {
  let env: ReturnType<typeof makeEnv>;

  beforeAll(() => {
    env = makeEnv();
  });

  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await env.db.delete(schema.reactions);
    await env.db.delete(schema.comments);
    await env.db.delete(schema.posts);
    await env.db.delete(schema.badges);
  });

  it("rejects unauthenticated comments", async () => {
    const token = await claim(env.app);
    const postId = await makePost(env, token);
    const r = await request(env.app).post(`/posts/${postId}/comments`).send({ content: "hi" });
    expect(r.status).toBe(401);
  });

  it("creates a top-level comment", async () => {
    const token = await claim(env.app);
    const postId = await makePost(env, token);
    const r = await request(env.app)
      .post(`/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "first reply" });
    expect(r.status).toBe(201);
    expect(r.body.comment.content).toBe("first reply");
    expect(r.body.comment.parentId).toBeNull();
    expect(r.body.comment.authorAnonId).toMatch(/^anon_[0-9a-f]{16}$/);
  });

  it("creates a threaded reply when parentId is provided", async () => {
    const tokenA = await claim(env.app);
    const tokenB = await claim(env.app, "bonk_holder");
    const postId = await makePost(env, tokenA);
    const top = await request(env.app)
      .post(`/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ content: "top" });
    const child = await request(env.app)
      .post(`/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ content: "child", parentId: top.body.comment.id });
    expect(child.status).toBe(201);
    expect(child.body.comment.parentId).toBe(top.body.comment.id);
  });

  it("rejects parentId from a different post", async () => {
    const token = await claim(env.app);
    const postA = await makePost(env, token, "post A");
    const postB = await makePost(env, token, "post B");
    const onA = await request(env.app)
      .post(`/posts/${postA}/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "comment on A" });
    const r = await request(env.app)
      .post(`/posts/${postB}/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "this should fail", parentId: onA.body.comment.id });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("invalid_parent");
  });

  it("returns 404 when commenting on a missing post", async () => {
    const token = await claim(env.app);
    const r = await request(env.app)
      .post(`/posts/00000000-0000-0000-0000-000000000000/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "x" });
    expect(r.status).toBe(404);
  });

  it("comment + post by same badge token share the same anon_id", async () => {
    const token = await claim(env.app);
    const postId = await makePost(env, token);
    const c = await request(env.app)
      .post(`/posts/${postId}/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "from same badge" });
    const fetched = await request(env.app).get(`/posts/${postId}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.post.authorAnonId).toBe(c.body.comment.authorAnonId);
  });
});

describeIfDb("POST /posts/:id/reactions", () => {
  let env: ReturnType<typeof makeEnv>;

  beforeAll(() => {
    env = makeEnv();
  });

  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await env.db.delete(schema.reactions);
    await env.db.delete(schema.comments);
    await env.db.delete(schema.posts);
    await env.db.delete(schema.badges);
  });

  it("creates a reaction with a valid kind", async () => {
    const token = await claim(env.app);
    const postId = await makePost(env, token);
    const r = await request(env.app)
      .post(`/posts/${postId}/reactions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "up" });
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(true);
    expect(r.body.reaction.kind).toBe("up");
  });

  it("is idempotent: second up-vote returns the existing reaction", async () => {
    const token = await claim(env.app);
    const postId = await makePost(env, token);
    const first = await request(env.app)
      .post(`/posts/${postId}/reactions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "up" });
    const second = await request(env.app)
      .post(`/posts/${postId}/reactions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "up" });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.created).toBe(false);
    expect(second.body.reaction.id).toBe(first.body.reaction.id);
  });

  it("rejects invalid reaction kinds", async () => {
    const token = await claim(env.app);
    const postId = await makePost(env, token);
    const r = await request(env.app)
      .post(`/posts/${postId}/reactions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "rocket" });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("invalid_request");
  });

  it("returns 404 when reacting to a missing post", async () => {
    const token = await claim(env.app);
    const r = await request(env.app)
      .post(`/posts/00000000-0000-0000-0000-000000000000/reactions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "up" });
    expect(r.status).toBe(404);
  });

  it("allows same reactor to up AND down with different rows", async () => {
    const token = await claim(env.app);
    const postId = await makePost(env, token);
    const up = await request(env.app)
      .post(`/posts/${postId}/reactions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "up" });
    const down = await request(env.app)
      .post(`/posts/${postId}/reactions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "down" });
    expect(up.body.created).toBe(true);
    expect(down.body.created).toBe(true);
    expect(up.body.reaction.id).not.toBe(down.body.reaction.id);
  });
});
