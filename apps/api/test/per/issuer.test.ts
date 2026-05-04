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

// See test/_setup/db-isolation.ts. Tests must never run against the prod DB.
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
} else {
  delete process.env.DATABASE_URL;
}

const { createApp } = await import("../../src/app.js");
const { getDb, closeDb, schema } = await import("../../src/db/index.js");
const { BadgeIssuer } = await import("../../src/per/issuer.js");
const { StubEvidenceVerifier } = await import("../../src/per/evidence.js");
const { verifyBadgeToken } = await import("../../src/per/token.js");

const haveDb = !!process.env.DATABASE_URL_TEST;
const describeIfDb = haveDb ? describe : describe.skip;

function makeIssuerEnv() {
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
    evidence: new StubEvidenceVerifier({ ok: true }),
    perPubkeyBase58: perPubB58,
    perSecretKey: perKp.secretKey,
  });
  return { db, perKp, perPubB58, app };
}

function signedClaim(challenge: string) {
  const wallet = Keypair.generate();
  const sig = nacl.sign.detached(new TextEncoder().encode(challenge), wallet.secretKey);
  return {
    wallet: wallet.publicKey.toBase58(),
    challenge,
    signature: bs58.encode(sig),
  };
}

describeIfDb("POST /badges/claim", () => {
  let env: ReturnType<typeof makeIssuerEnv>;

  beforeAll(async () => {
    env = makeIssuerEnv();
    await env.db.delete(schema.reactions);
    await env.db.delete(schema.comments);
    await env.db.delete(schema.posts);
    await env.db.delete(schema.badges);
  });

  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await env.db.delete(schema.badges);
  });

  it("issues a badge token for a valid claim", async () => {
    const claim = signedClaim("test challenge a");
    const res = await request(env.app)
      .post("/badges/claim")
      .send({ ...claim, kind: "jup_holder" });

    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("jup_holder");
    expect(res.body.label).toBe("verified $JUP holder");
    expect(typeof res.body.badgeId).toBe("string");
    expect(typeof res.body.badgeToken).toBe("string");
    expect(typeof res.body.expiresAt).toBe("number");

    // Verify the issued token verifies under our PER pubkey.
    const payload = verifyBadgeToken(res.body.badgeToken, env.perPubB58);
    expect(payload.badgeId).toBe(res.body.badgeId);
    expect(payload.kind).toBe("jup_holder");
    expect(payload.anonSeed).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects when the wallet signature is invalid", async () => {
    const claim = signedClaim("real challenge");
    const res = await request(env.app)
      .post("/badges/claim")
      .send({ ...claim, kind: "jup_holder", challenge: "different challenge" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("claim_rejected");
  });

  it("rejects when evidence check fails", async () => {
    const failingIssuer = new BadgeIssuer({
      db: env.db,
      evidence: new StubEvidenceVerifier({ ok: false, reason: "not enough JUP" }),
      perSecretKey: env.perKp.secretKey,
      perPubkeyBase58: env.perPubB58,
    });
    const failingApp = createApp({
      db: env.db,
      badgeIssuer: failingIssuer,
      evidence: new StubEvidenceVerifier({ ok: false, reason: "not enough JUP" }),
      perPubkeyBase58: env.perPubB58,
      perSecretKey: env.perKp.secretKey,
    });

    const claim = signedClaim("test challenge");
    const res = await request(failingApp)
      .post("/badges/claim")
      .send({ ...claim, kind: "jup_holder" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("claim_rejected");
    expect(res.body.reason).toMatch(/not enough JUP/);
  });

  it("rejects unknown badge kinds at the validation layer", async () => {
    const claim = signedClaim("test challenge");
    const res = await request(env.app)
      .post("/badges/claim")
      .send({ ...claim, kind: "unknown_kind" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });

  it("does NOT store the wallet anywhere in the public badges table", async () => {
    const claim = signedClaim("test challenge");
    const res = await request(env.app)
      .post("/badges/claim")
      .send({ ...claim, kind: "jup_holder" });
    expect(res.status).toBe(201);

    const rows = await env.db.select().from(schema.badges);
    expect(rows.length).toBe(1);
    const row = rows[0]!;
    // Defensive check: no row column should contain the wallet pubkey.
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(claim.wallet);
  });
});

describeIfDb("GET /badges/:id", () => {
  let env: ReturnType<typeof makeIssuerEnv>;

  beforeAll(() => {
    env = makeIssuerEnv();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("returns 404 for an unknown badge", async () => {
    const res = await request(env.app).get("/badges/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("returns the badge with its label", async () => {
    const claim = signedClaim("test challenge for read");
    const issued = await request(env.app)
      .post("/badges/claim")
      .send({ ...claim, kind: "bonk_holder" });
    expect(issued.status).toBe(201);

    const res = await request(env.app).get(`/badges/${issued.body.badgeId}`);
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("bonk_holder");
    expect(res.body.label).toBe("verified $BONK holder");
    expect(res.body.id).toBe(issued.body.badgeId);
  });
});
