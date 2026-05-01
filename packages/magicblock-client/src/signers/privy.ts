import bs58 from "bs58";
import type { WalletSigner } from "../signer.js";

/**
 * Minimal shape we need from a Privy server-wallet client. We type-narrow at
 * the boundary so we are not pinned to a single version of @privy-io/server-auth
 * during the hackathon (the SDK has been moving fast).
 *
 * In practice: pass `new PrivyClient({ appId, appSecret })` and we will look
 * up `walletApi.solana.signMessage` or the equivalent path at runtime.
 */
export interface PrivySolanaCapableClient {
  walletApi: {
    solana: {
      signMessage: (input: {
        walletId: string;
        message: string;
      }) => Promise<{ signature: string; encoding: string }>;
    };
  };
  getWallet?: (walletId: string) => Promise<{ address: string }>;
}

export interface PrivySignerConfig {
  client: PrivySolanaCapableClient;
  walletId: string;
  /** Public key, in case getWallet is unavailable. */
  publicKey?: string;
}

/**
 * WalletSigner backed by a Privy server wallet. Signing is delegated to
 * Privy's HSM-backed signer; we never see the secret key.
 */
export class PrivySigner implements WalletSigner {
  private cachedPubkey: string | undefined;

  constructor(private readonly config: PrivySignerConfig) {
    this.cachedPubkey = config.publicKey;
  }

  async publicKey(): Promise<string> {
    if (this.cachedPubkey) return this.cachedPubkey;
    if (!this.config.client.getWallet) {
      throw new Error("PrivySigner: pass `publicKey` in config or use a client that exposes getWallet()");
    }
    const wallet = await this.config.client.getWallet(this.config.walletId);
    this.cachedPubkey = wallet.address;
    return wallet.address;
  }

  async signMessage(message: string): Promise<string> {
    const { signature, encoding } = await this.config.client.walletApi.solana.signMessage({
      walletId: this.config.walletId,
      message,
    });
    return normalizeSignatureToBase58(signature, encoding);
  }
}

function normalizeSignatureToBase58(signature: string, encoding: string): string {
  switch (encoding.toLowerCase()) {
    case "base58":
    case "bs58":
      return signature;
    case "base64": {
      const bytes = Uint8Array.from(Buffer.from(signature, "base64"));
      return bs58.encode(bytes);
    }
    case "hex": {
      const hex = signature.startsWith("0x") ? signature.slice(2) : signature;
      const bytes = Uint8Array.from(Buffer.from(hex, "hex"));
      return bs58.encode(bytes);
    }
    default:
      throw new Error(`PrivySigner: unsupported signature encoding "${encoding}"`);
  }
}
