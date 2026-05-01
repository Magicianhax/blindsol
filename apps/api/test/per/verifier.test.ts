import { describe, it, expect } from "vitest";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { WalletSignatureError, verifyWalletSignature } from "../../src/per/verifier.js";

function signWith(walletKp: Keypair, msg: string): string {
  const sig = nacl.sign.detached(new TextEncoder().encode(msg), walletKp.secretKey);
  return bs58.encode(sig);
}

describe("verifyWalletSignature", () => {
  it("accepts a real signature from the claimed wallet", () => {
    const kp = Keypair.generate();
    const challenge = "claim badge ABC";
    const sig = signWith(kp, challenge);
    expect(() =>
      verifyWalletSignature({
        walletBase58: kp.publicKey.toBase58(),
        challenge,
        signatureBase58: sig,
      }),
    ).not.toThrow();
  });

  it("rejects when the wallet does not match the signing key", () => {
    const signer = Keypair.generate();
    const claimedWallet = Keypair.generate();
    const challenge = "claim badge ABC";
    const sig = signWith(signer, challenge);
    expect(() =>
      verifyWalletSignature({
        walletBase58: claimedWallet.publicKey.toBase58(),
        challenge,
        signatureBase58: sig,
      }),
    ).toThrow(WalletSignatureError);
  });

  it("rejects when the challenge is altered after signing", () => {
    const kp = Keypair.generate();
    const sig = signWith(kp, "original challenge");
    expect(() =>
      verifyWalletSignature({
        walletBase58: kp.publicKey.toBase58(),
        challenge: "tampered challenge",
        signatureBase58: sig,
      }),
    ).toThrow(WalletSignatureError);
  });

  it("rejects malformed signature encoding", () => {
    const kp = Keypair.generate();
    expect(() =>
      verifyWalletSignature({
        walletBase58: kp.publicKey.toBase58(),
        challenge: "x",
        signatureBase58: "!!!not-base58!!!",
      }),
    ).toThrow(WalletSignatureError);
  });
});
