import { describe, it, expect, vi, beforeEach } from "vitest";
import { MagicBlockClient } from "../src/client.js";
import { KeypairSigner } from "../src/signers/keypair.js";
import { MagicBlockApiError } from "../src/types.js";

const API_BASE = "https://payments.magicblock.test";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function makeFetchStub(responses: Array<{ match: RegExp; response: unknown; status?: number }>) {
  const calls: RecordedCall[] = [];
  const stub: typeof fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init.method ?? "GET").toUpperCase();
    const headers = Object.fromEntries(
      new Headers(init.headers as HeadersInit | undefined).entries(),
    );
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, method, headers, body });

    const match = responses.find((r) => r.match.test(url));
    if (!match) throw new Error(`No fetch stub matched ${url}`);

    return new Response(JSON.stringify(match.response), {
      status: match.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { stub, calls };
}

describe("MagicBlockClient.login", () => {
  let signer: KeypairSigner;

  beforeEach(() => {
    signer = KeypairSigner.generate();
  });

  it("runs challenge → sign → login and caches the bearer token", async () => {
    const { stub, calls } = makeFetchStub([
      { match: /\/v1\/spl\/challenge/, response: { challenge: "challenge-xyz" } },
      { match: /\/v1\/spl\/login/, response: { token: "bearer-abc" } },
    ]);

    const client = new MagicBlockClient({ apiBase: API_BASE, signer, fetchImpl: stub });

    const session = await client.login();

    expect(session.pubkey).toBe(await signer.publicKey());
    expect(session.bearerToken).toBe("bearer-abc");
    expect(calls).toHaveLength(2);
  });

  it("returns the cached session on the second call", async () => {
    const { stub, calls } = makeFetchStub([
      { match: /\/v1\/spl\/challenge/, response: { challenge: "c1" } },
      { match: /\/v1\/spl\/login/, response: { token: "t1" } },
    ]);
    const client = new MagicBlockClient({ apiBase: API_BASE, signer, fetchImpl: stub });

    const a = await client.login();
    const b = await client.login();

    expect(a).toBe(b);
    expect(calls).toHaveLength(2);
  });

  it("throws MagicBlockApiError on non-2xx", async () => {
    const stub = vi.fn().mockResolvedValue(
      new Response("server is on fire", { status: 503, statusText: "Service Unavailable" }),
    );
    const client = new MagicBlockClient({ apiBase: API_BASE, signer, fetchImpl: stub });

    await expect(client.login()).rejects.toBeInstanceOf(MagicBlockApiError);
  });

  it("throws when no signer is configured", async () => {
    const stub = vi.fn();
    const client = new MagicBlockClient({ apiBase: API_BASE, fetchImpl: stub });
    await expect(client.login()).rejects.toThrow(/no signer configured/);
  });
});

describe("MagicBlockClient.balance", () => {
  it("calls /v1/spl/balance unauthenticated", async () => {
    const { stub, calls } = makeFetchStub([
      {
        match: /\/v1\/spl\/balance/,
        response: { address: "OWNER", mint: USDC, ata: "ATA", location: "base", balance: "1000000" },
      },
    ]);
    const client = new MagicBlockClient({ apiBase: API_BASE, fetchImpl: stub });

    const result = await client.balance({ address: "OWNER", mint: USDC });

    expect(result.balance).toBe("1000000");
    expect(result.location).toBe("base");
    expect(calls[0]!.headers.authorization).toBeUndefined();
    expect(calls[0]!.url).toContain("address=OWNER");
    expect(calls[0]!.url).toContain(`mint=${USDC}`);
  });

  it("attaches Bearer on /v1/spl/private-balance via login flow", async () => {
    const signer = KeypairSigner.generate();
    const { stub, calls } = makeFetchStub([
      { match: /\/v1\/spl\/challenge/, response: { challenge: "c" } },
      { match: /\/v1\/spl\/login/, response: { token: "tok" } },
      {
        match: /\/v1\/spl\/private-balance/,
        response: { address: "OWNER", mint: USDC, ata: "ATA", location: "ephemeral", balance: "500000" },
      },
    ]);
    const client = new MagicBlockClient({ apiBase: API_BASE, signer, fetchImpl: stub });

    await client.privateBalance({ address: "OWNER", mint: USDC });

    const privateCall = calls.find((c) => c.url.includes("/v1/spl/private-balance"))!;
    expect(privateCall.headers.authorization).toBe("Bearer tok");
  });
});

describe("MagicBlockClient.buildTransfer", () => {
  it("posts the documented private base→base shape and returns the unsigned tx", async () => {
    const { stub, calls } = makeFetchStub([
      {
        match: /\/v1\/spl\/transfer/,
        response: {
          kind: "transfer",
          version: "v0",
          transactionBase64: "BASE64_TX",
          sendTo: "base",
          recentBlockhash: "BLOCKHASH",
          lastValidBlockHeight: 12345,
          instructionCount: 2,
          requiredSigners: ["FROM_PUBKEY"],
          validator: "VALIDATOR_PUBKEY",
        },
      },
    ]);
    const client = new MagicBlockClient({ apiBase: API_BASE, fetchImpl: stub });

    const result = await client.buildTransfer({
      from: "FROM_PUBKEY",
      to: "TO_PUBKEY",
      mint: USDC,
      amount: 100_000,
      visibility: "private",
      fromBalance: "base",
      toBalance: "base",
      initAtasIfMissing: true,
    });

    expect(result.transactionBase64).toBe("BASE64_TX");
    expect(result.requiredSigners).toEqual(["FROM_PUBKEY"]);
    const transferCall = calls[0]!;
    expect(transferCall.method).toBe("POST");
    expect(transferCall.body).toMatchObject({
      from: "FROM_PUBKEY",
      to: "TO_PUBKEY",
      mint: USDC,
      amount: 100_000,
      visibility: "private",
      fromBalance: "base",
      toBalance: "base",
      initAtasIfMissing: true,
    });
    // Should NOT include a sender/recipient field — those were the wrong names.
    expect(transferCall.body).not.toHaveProperty("sender");
    expect(transferCall.body).not.toHaveProperty("recipient");
  });

  it("attaches a Bearer token when explicitly provided", async () => {
    const { stub, calls } = makeFetchStub([
      {
        match: /\/v1\/spl\/transfer/,
        response: {
          kind: "transfer",
          version: "v0",
          transactionBase64: "X",
          sendTo: "base",
          recentBlockhash: "B",
          lastValidBlockHeight: 1,
          instructionCount: 1,
          requiredSigners: [],
          validator: "V",
        },
      },
    ]);
    const client = new MagicBlockClient({ apiBase: API_BASE, fetchImpl: stub });

    await client.buildTransfer(
      {
        from: "F",
        to: "T",
        mint: USDC,
        amount: 1,
        visibility: "private",
        fromBalance: "ephemeral",
        toBalance: "ephemeral",
      },
      { bearerToken: "tok-123" },
    );

    expect(calls[0]!.headers.authorization).toBe("Bearer tok-123");
  });

  it("forwards split + delay knobs for private transfers", async () => {
    const { stub, calls } = makeFetchStub([
      {
        match: /\/v1\/spl\/transfer/,
        response: {
          kind: "transfer",
          version: "v0",
          transactionBase64: "X",
          sendTo: "base",
          recentBlockhash: "B",
          lastValidBlockHeight: 1,
          instructionCount: 1,
          requiredSigners: [],
          validator: "V",
        },
      },
    ]);
    const client = new MagicBlockClient({ apiBase: API_BASE, fetchImpl: stub });

    await client.buildTransfer({
      from: "F",
      to: "T",
      mint: USDC,
      amount: 100,
      visibility: "private",
      fromBalance: "base",
      toBalance: "base",
      split: 3,
      minDelayMs: "1000",
      maxDelayMs: "5000",
      memo: "stake-bond",
    });

    expect(calls[0]!.body).toMatchObject({
      split: 3,
      minDelayMs: "1000",
      maxDelayMs: "5000",
      memo: "stake-bond",
    });
  });
});

describe("MagicBlockClient.buildDeposit", () => {
  it("posts the documented deposit shape and returns base sendTo", async () => {
    const { stub, calls } = makeFetchStub([
      {
        match: /\/v1\/spl\/deposit/,
        response: {
          kind: "deposit",
          version: "legacy",
          transactionBase64: "DEPOSIT_TX",
          sendTo: "base",
          recentBlockhash: "B",
          lastValidBlockHeight: 1,
          instructionCount: 1,
          requiredSigners: ["OWNER"],
          validator: "V",
        },
      },
    ]);
    const client = new MagicBlockClient({ apiBase: API_BASE, fetchImpl: stub });

    const result = await client.buildDeposit({
      owner: "OWNER",
      amount: 5_000_000,
    });

    expect(result.kind).toBe("deposit");
    expect(result.sendTo).toBe("base");
    expect(calls[0]!.body).toMatchObject({ owner: "OWNER", amount: 5_000_000 });
  });
});

describe("cluster default", () => {
  it("appends the configured cluster as a query param", async () => {
    const { stub, calls } = makeFetchStub([
      {
        match: /\/v1\/spl\/transfer/,
        response: {
          kind: "transfer",
          version: "v0",
          transactionBase64: "X",
          sendTo: "base",
          recentBlockhash: "B",
          lastValidBlockHeight: 1,
          instructionCount: 1,
          requiredSigners: [],
          validator: "V",
        },
      },
    ]);
    const client = new MagicBlockClient({ apiBase: API_BASE, fetchImpl: stub, cluster: "mainnet" });

    await client.buildTransfer({
      from: "F",
      to: "T",
      mint: USDC,
      amount: 1,
      visibility: "public",
      fromBalance: "base",
      toBalance: "base",
    });

    expect(calls[0]!.url).toContain("cluster=mainnet");
    expect(calls[0]!.body).toMatchObject({ cluster: "mainnet" });
  });
});
