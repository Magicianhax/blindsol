import { describe, it, expect } from "vitest";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { Keypair, PublicKey } from "@solana/web3.js";
import { KeypairSigner } from "../../src/signers/keypair.js";

describe("KeypairSigner", () => {
  it("produces a base58 ed25519 signature that verifies against the public key", async () => {
    const signer = KeypairSigner.generate();
    const pubkey = await signer.publicKey();
    const message = "magicblock challenge: 12345";

    const sigB58 = await signer.signMessage(message);

    const sigBytes = bs58.decode(sigB58);
    const ok = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      sigBytes,
      new PublicKey(pubkey).toBytes(),
    );
    expect(ok).toBe(true);
  });

  it("round-trips through fromSecretBase58", async () => {
    const original = Keypair.generate();
    const secretB58 = bs58.encode(original.secretKey);

    const signer = KeypairSigner.fromSecretBase58(secretB58);

    expect(await signer.publicKey()).toBe(original.publicKey.toBase58());
  });
});
