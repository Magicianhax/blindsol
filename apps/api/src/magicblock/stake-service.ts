import {
  type Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { MagicBlockClient } from "@blindsol/magicblock-client";

export interface StakeServiceConfig {
  client: MagicBlockClient;
  connection: Connection;
  houseKeypair: Keypair;
  stakePoolPubkey: PublicKey;
  /** SPL token mint to escrow (USDC by default). */
  mint: PublicKey;
  /** Per-post stake amount in raw token units (e.g. 100_000 = 0.1 USDC at 6 decimals). */
  perPostAmountRaw: bigint;
  /**
   * `mainnet` | `devnet` | a custom RPC URL. Forwarded to MagicBlock so it
   * targets the correct cluster when looking up validators / vaults.
   */
  cluster?: string;
  /** Memo string attached to each transfer for traceability. */
  memo?: string;
}

export interface StakeReceipt {
  signature: string;
  amountRaw: string;
  recipient: string;
  /** True when the transfer settled inside the PER (no on-chain link visible). */
  privateSettlement: boolean;
}

export class StakeServiceError extends Error {
  public readonly underlying?: unknown;
  constructor(message: string, underlying?: unknown) {
    super(message);
    this.name = "StakeServiceError";
    this.underlying = underlying;
  }
}

/**
 * Wraps the MagicBlock client to escrow a stake bond per post via a
 * `visibility: "private"` base→base SPL transfer. The flow:
 *   1. Build the unsigned tx (no auth required for base→base private route).
 *   2. Sign locally with the house keypair.
 *   3. Submit to Solana mainnet / configured cluster.
 *   4. Wait for confirmation, return signature.
 */
export class MagicBlockStakeService {
  /** Whether the (mint, validator) ATAs/queues have been bootstrapped. */
  private initialized = false;

  constructor(private readonly config: StakeServiceConfig) {}

  /**
   * Sanity-check the house wallet has funds. Doesn't run an auth challenge —
   * private base→base transfers don't need a bearer token.
   */
  async initialize(): Promise<{ baseChainAmount: string }> {
    const housePub = this.config.houseKeypair.publicKey.toBase58();
    let baseChainAmount = "0";
    try {
      const bal = await this.config.client.balance({
        address: housePub,
        mint: this.config.mint.toBase58(),
        ...(this.config.cluster ? { cluster: this.config.cluster } : {}),
      });
      baseChainAmount = bal.balance;
    } catch (err) {
      console.warn(`[stake] base-chain balance lookup failed: ${describe(err)}`);
    }

    if (baseChainAmount === "0") {
      console.warn(
        `[stake] ⚠ house wallet ${housePub} has 0 USDC base balance. Posting will fail until it's funded.`,
      );
    } else {
      console.log(`[stake] house base-chain USDC balance = ${baseChainAmount} (raw)`);
    }
    return { baseChainAmount };
  }

  /**
   * Lock a stake bond for a new post. Builds → signs → submits a private
   * transfer of `perPostAmountRaw` USDC from the house wallet to the stake
   * pool. Returns the Solana tx signature once confirmed.
   *
   * The first call may include `initIfMissing` flags to bootstrap the
   * validator-scoped queue + ATAs. Subsequent calls use the lean payload.
   */
  async lockStake(): Promise<StakeReceipt> {
    const recipient = this.config.stakePoolPubkey.toBase58();
    const amountRaw = this.config.perPostAmountRaw;

    if (amountRaw > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new StakeServiceError(`stake amount ${amountRaw} exceeds JS safe integer`);
    }
    const amount = Number(amountRaw);

    let unsigned;
    try {
      unsigned = await this.config.client.buildTransfer({
        from: this.config.houseKeypair.publicKey.toBase58(),
        to: recipient,
        mint: this.config.mint.toBase58(),
        amount,
        visibility: "private",
        fromBalance: "base",
        toBalance: "base",
        // Only include heavy init flags on the very first transfer; afterwards
        // the queue/vault/ATAs are already created.
        initAtasIfMissing: !this.initialized,
        ...(this.config.cluster ? { cluster: this.config.cluster } : {}),
        ...(this.config.memo ? { memo: this.config.memo } : {}),
      });
      this.initialized = true;
    } catch (err) {
      throw new StakeServiceError(`MagicBlock /v1/spl/transfer failed: ${describe(err)}`, err);
    }

    const txBuf = Buffer.from(unsigned.transactionBase64, "base64");
    let serialized: Uint8Array;
    try {
      serialized = signTransaction(txBuf, this.config.houseKeypair);
    } catch (err) {
      throw new StakeServiceError(`failed to sign MagicBlock transfer: ${describe(err)}`, err);
    }

    let signature: string;
    try {
      signature = await this.config.connection.sendRawTransaction(serialized, {
        skipPreflight: false,
        maxRetries: 3,
      });
      await this.config.connection.confirmTransaction(
        {
          signature,
          blockhash: unsigned.recentBlockhash,
          lastValidBlockHeight: unsigned.lastValidBlockHeight,
        },
        "confirmed",
      );
    } catch (err) {
      throw new StakeServiceError(`failed to submit transfer to Solana: ${describe(err)}`, err);
    }

    return {
      signature,
      amountRaw: amountRaw.toString(),
      recipient,
      privateSettlement: true,
    };
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Sign a base64-decoded transaction (legacy or versioned) with the given keypair.
 * Returns the wire-ready serialized bytes.
 */
function signTransaction(buf: Buffer, signer: Keypair): Uint8Array {
  // Try VersionedTransaction first (the modern shape MagicBlock returns).
  try {
    const v = VersionedTransaction.deserialize(buf);
    v.sign([signer]);
    return v.serialize();
  } catch {
    // Fall back to legacy Transaction.
    const legacy = Transaction.from(buf);
    legacy.partialSign(signer);
    return legacy.serialize();
  }
}
