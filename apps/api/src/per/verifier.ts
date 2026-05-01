import bs58 from "bs58";
import nacl from "tweetnacl";

export class WalletSignatureError extends Error {
  constructor(public readonly reason: string) {
    super(`Wallet signature rejected: ${reason}`);
    this.name = "WalletSignatureError";
  }
}

/**
 * Verify that the user controls the wallet they're claiming a badge for, by
 * checking they signed our challenge with their wallet's secret key.
 */
export function verifyWalletSignature(args: {
  walletBase58: string;
  challenge: string;
  signatureBase58: string;
}): void {
  let pub: Uint8Array;
  let sig: Uint8Array;
  try {
    pub = bs58.decode(args.walletBase58);
    sig = bs58.decode(args.signatureBase58);
  } catch {
    throw new WalletSignatureError("malformed wallet or signature encoding");
  }
  if (pub.length !== 32) throw new WalletSignatureError("wallet pubkey must be 32 bytes");
  if (sig.length !== 64) throw new WalletSignatureError("signature must be 64 bytes");

  const msg = new TextEncoder().encode(args.challenge);
  if (!nacl.sign.detached.verify(msg, sig, pub)) {
    throw new WalletSignatureError("signature does not verify");
  }
}
