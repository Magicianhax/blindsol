export { MagicBlockClient } from "./client.js";
export { KeypairSigner } from "./signers/keypair.js";
export { PrivySigner, type PrivySignerConfig, type PrivySolanaCapableClient } from "./signers/privy.js";
export type { WalletSigner } from "./signer.js";
export {
  type AuthSession,
  type BalanceResult,
  type ChallengeResponse,
  type LoginResponse,
  MagicBlockApiError,
} from "./types.js";
export type { MagicBlockClientConfig } from "./client.js";
