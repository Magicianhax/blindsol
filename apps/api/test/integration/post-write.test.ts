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
const { deriveAuthorAnonId } = await import("../../src/per/anon.js");

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
  return { db, perPubB58, app };
}

async function claimBadge(app: any, kind: "jup_holder" | "anthropic_eng" = "jup_holder") {
  const wallet = Keypair.generate();
  const challenge = `claim ${kind} ${Date.now()} ${Math.random()}`;
  const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(challenge), wallet.secretKey));
  const res = await request(app)
    .post("/badges/claim")
    .send({ wallet: wallet.publicKey.toBase58(), kind, challenge, signature: sig });
  if (res.status !== 201) throw new Error(`claim failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { wallet: wallet.publicKey.toBase58(), token: res.body.badgeToken as string };
}

describeIfDb("POST /posts (integration)", () => {
  let env: ReturnType<typeof makeEnv>;

  beforeAll(async () => {
    env = makeEnv();
    await env.db.delete(schema.reactions);
    await env.db.delete(schema.comments);
    await env.db.delete(schema.posts);
    await env.db.delete(schema.badges);
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

  it("rejects when no badge token is present", async () => {
    const res = await request(env.app).post("/posts").send({ content: "hi" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("missing_badge_token");
  });

  it("rejects with an invalid token", async () => {
    const res = await request(env.app)
      .post("/posts")
      .set("Authorization", "Bearer not-a-real-token")
      .send({ content: "hi" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_badge_token");
  });

  it("rejects empty content", async () => {
    const { token } = await claimBadge(env.app);
    const res = await request(env.app)
      .post("/posts")
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });

  it("creates a post with a derived anon_id and persists it", async () => {
    const claim = await claimBadge(env.app, "jup_holder");
    const res = await request(env.app)
      .post("/posts")
      .set("Authorization", `Bearer ${claim.token}`)
      .send({ content: "hot take from a verified jup holder" });

    expect(res.status).toBe(201);
    const post = res.body.post;
    expect(post.content).toBe("hot take from a verified jup holder");
    expect(post.badgeKind).toBe("jup_holder");
    expect(post.authorAnonId).toMatch(/^anon_[0-9a-f]{16}$/);

    // Persisted row mirrors the response.
    const rows = await env.db.select().from(schema.posts);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(post.id);

    // Critical: the wallet is not stored anywhere on the post row.
    const serialized = JSON.stringify(rows[0]);
    expect(serialized).not.toContain(claim.wallet);
  });

  it("two posts from the same badge token share the same anon_id", async () => {
    const claim = await claimBadge(env.app, "anthropic_eng");
    const a = await request(env.app)
      .post("/posts")
      .set("Authorization", `Bearer ${claim.token}`)
      .send({ content: "post one" });
    const b = await request(env.app)
      .post("/posts")
      .set("Authorization", `Bearer ${claim.token}`)
      .send({ content: "post two" });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.post.authorAnonId).toBe(b.body.post.authorAnonId);
  });

  it("two different badge tokens produce different anon_ids", async () => {
    const claim1 = await claimBadge(env.app, "jup_holder");
    const claim2 = await claimBadge(env.app, "jup_holder");
    const a = await request(env.app)
      .post("/posts")
      .set("Authorization", `Bearer ${claim1.token}`)
      .send({ content: "from claim1" });
    const b = await request(env.app)
      .post("/posts")
      .set("Authorization", `Bearer ${claim2.token}`)
      .send({ content: "from claim2" });
    expect(a.body.post.authorAnonId).not.toBe(b.body.post.authorAnonId);
  });

  it("post then GET /posts/:id round-trips correctly", async () => {
    const { token } = await claimBadge(env.app);
    const created = await request(env.app)
      .post("/posts")
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "fetched back" });
    expect(created.status).toBe(201);

    const fetched = await request(env.app).get(`/posts/${created.body.post.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.post.content).toBe("fetched back");
  });
});
