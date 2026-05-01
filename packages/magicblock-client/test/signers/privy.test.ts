import { describe, it, expect, vi } from "vitest";
import bs58 from "bs58";
import { PrivySigner, type PrivySolanaCapableClient } from "../../src/signers/privy.js";

function fakeClient(
  signMessage: PrivySolanaCapableClient["walletApi"]["solana"]["signMessage"],
  getWallet?: (walletId: string) => Promise<{ address: string }>,
): PrivySolanaCapableClient {
  return {
    walletApi: { solana: { signMessage } },
    ...(getWallet ? { getWallet } : {}),
  };
}

describe("PrivySigner", () => {
  it("returns the cached publicKey when provided in config", async () => {
    const client = fakeClient(vi.fn());
    const signer = new PrivySigner({ client, walletId: "w1", publicKey: "PUB" });

    expect(await signer.publicKey()).toBe("PUB");
  });

  it("falls back to client.getWallet when publicKey is not configured", async () => {
    const getWallet = vi.fn().mockResolvedValue({ address: "RESOLVED_PUB" });
    const client = fakeClient(vi.fn(), getWallet);
    const signer = new PrivySigner({ client, walletId: "w1" });

    expect(await signer.publicKey()).toBe("RESOLVED_PUB");
    expect(getWallet).toHaveBeenCalledWith("w1");
  });

  it("passes base58 signatures through unchanged", async () => {
    const signMessage = vi.fn().mockResolvedValue({ signature: "sigB58", encoding: "base58" });
    const signer = new PrivySigner({
      client: fakeClient(signMessage),
      walletId: "w1",
      publicKey: "PUB",
    });

    const out = await signer.signMessage("hi");
    expect(out).toBe("sigB58");
  });

  it("converts base64 signatures to base58", async () => {
    const raw = new Uint8Array([1, 2, 3, 4, 5]);
    const b64 = Buffer.from(raw).toString("base64");
    const expected = bs58.encode(raw);
    const signMessage = vi.fn().mockResolvedValue({ signature: b64, encoding: "base64" });
    const signer = new PrivySigner({
      client: fakeClient(signMessage),
      walletId: "w1",
      publicKey: "PUB",
    });

    expect(await signer.signMessage("hi")).toBe(expected);
  });

  it("throws on unsupported signature encoding", async () => {
    const signMessage = vi.fn().mockResolvedValue({ signature: "sig", encoding: "morse" });
    const signer = new PrivySigner({
      client: fakeClient(signMessage),
      walletId: "w1",
      publicKey: "PUB",
    });

    await expect(signer.signMessage("hi")).rejects.toThrow(/morse/);
  });
});
