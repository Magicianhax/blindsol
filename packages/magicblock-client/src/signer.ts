/**
 * Abstract signer used by MagicBlockClient.
 *
 * The MagicBlock auth flow signs a server-issued challenge with the wallet's
 * private key. Concrete signers implement how that signing happens — local
 * Keypair, Privy server wallet, Crossmint, etc.
 */
export interface WalletSigner {
  /** Base58-encoded Solana public key. */
  publicKey(): Promise<string>;

  /**
   * Sign a UTF-8 challenge string and return the base58-encoded
   * 64-byte ed25519 signature.
   */
  signMessage(message: string): Promise<string>;
}
