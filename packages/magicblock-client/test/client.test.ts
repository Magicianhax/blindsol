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
    expect(calls[0]!.url).toContain(`/v1/spl/challenge?pubkey=${session.pubkey}`);
    expect(calls[1]!.url).toContain("/v1/spl/login");
    expect(calls[1]!.body).toMatchObject({
      pubkey: session.pubkey,
      challenge: "challenge-xyz",
    });
    expect(typeof (calls[1]!.body as { signature: string }).signature).toBe("string");
  });

  it("returns the cached session on the second call without hitting the network", async () => {
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

  it("throws MagicBlockApiError on non-2xx with the failing endpoint", async () => {
    const stub = vi.fn().mockResolvedValue(
      new Response("server is on fire", { status: 503, statusText: "Service Unavailable" }),
    );
    const client = new MagicBlockClient({ apiBase: API_BASE, signer, fetchImpl: stub });

    await expect(client.login()).rejects.toBeInstanceOf(MagicBlockApiError);
  });
});

describe("MagicBlockClient balance queries", () => {
  it("calls /v1/spl/balance unauthenticated after login", async () => {
    const signer = KeypairSigner.generate();
    const { stub, calls } = makeFetchStub([
      { match: /\/v1\/spl\/challenge/, response: { challenge: "c" } },
      { match: /\/v1\/spl\/login/, response: { token: "tok" } },
      {
        match: /\/v1\/spl\/balance/,
        response: { mint: USDC, amount: "1000000", decimals: 6 },
      },
    ]);
    const client = new MagicBlockClient({ apiBase: API_BASE, signer, fetchImpl: stub });

    const result = await client.balance(USDC);

    expect(result.amount).toBe("1000000");
    const balanceCall = calls.find((c) => c.url.includes("/v1/spl/balance"))!;
    expect(balanceCall.headers.authorization).toBeUndefined();
  });

  it("attaches Bearer token on /v1/spl/private-balance", async () => {
    const signer = KeypairSigner.generate();
    const { stub, calls } = makeFetchStub([
      { match: /\/v1\/spl\/challenge/, response: { challenge: "c" } },
      { match: /\/v1\/spl\/login/, response: { token: "tok" } },
      {
        match: /\/v1\/spl\/private-balance/,
        response: { mint: USDC, amount: "500000", decimals: 6 },
      },
    ]);
    const client = new MagicBlockClient({ apiBase: API_BASE, signer, fetchImpl: stub });

    await client.privateBalance(USDC);

    const privateCall = calls.find((c) => c.url.includes("/v1/spl/private-balance"))!;
    expect(privateCall.headers.authorization).toBe("Bearer tok");
  });
});
