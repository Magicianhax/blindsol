import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import type { WalletSigner } from "../signer.js";

/**
 * WalletSigner backed by a local Solana Keypair. Use for tests and for the
 * fallback dev path when no managed wallet provider is configured.
 */
export class KeypairSigner implements WalletSigner {
  constructor(private readonly keypair: Keypair) {}

  static fromSecretBase58(secretKeyBase58: string): KeypairSigner {
    return new KeypairSigner(Keypair.fromSecretKey(bs58.decode(secretKeyBase58)));
  }

  static generate(): KeypairSigner {
    return new KeypairSigner(Keypair.generate());
  }

  async publicKey(): Promise<string> {
    return this.keypair.publicKey.toBase58();
  }

  async signMessage(message: string): Promise<string> {
    const sig = nacl.sign.detached(new TextEncoder().encode(message), this.keypair.secretKey);
    return bs58.encode(sig);
  }
}
