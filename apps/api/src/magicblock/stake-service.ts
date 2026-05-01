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
 * Wraps the MagicBlock client to escrow a stake bond per post. The flow:
 *   1. Login (challenge → sign → bearer token), cached.
 *   2. Build an unsigned PRIVATE transfer from house → stake pool.
 *   3. Sign locally with the house keypair.
 *   4. Submit on Solana mainnet beta via the configured Connection.
 *   5. Wait for confirmation, return signature.
 */
export class MagicBlockStakeService {
  constructor(private readonly config: StakeServiceConfig) {}

  /** Login + sanity-check the house wallet has funds. */
  async initialize(): Promise<{ baseChainAmount: string; perAmount: string | null }> {
    const session = await this.config.client.login();
    console.log(`[stake] logged into MagicBlock as ${session.pubkey}`);

    const onChain = await this.config.client.balance(this.config.mint.toBase58()).catch((err) => {
      console.warn(`[stake] base-chain balance lookup failed: ${(err as Error).message}`);
      return null;
    });
    let perBalance: string | null = null;
    try {
      const pbal = await this.config.client.privateBalance(this.config.mint.toBase58());
      perBalance = pbal.amount;
    } catch (err) {
      console.warn(`[stake] private balance lookup failed: ${(err as Error).message}`);
    }

    const onChainAmount = onChain?.amount ?? "0";
    if (onChainAmount === "0" && (perBalance ?? "0") === "0") {
      console.warn(
        `[stake] ⚠ house wallet ${session.pubkey} has 0 USDC. Fund it before posting will move real money.`,
      );
    } else {
      console.log(`[stake] house base-chain USDC=${onChainAmount}, PER USDC=${perBalance ?? "?"}`);
    }
    return { baseChainAmount: onChainAmount, perAmount: perBalance };
  }

  /**
   * Lock a stake bond for a new post. Builds → signs → submits a private
   * transfer of `perPostAmountRaw` USDC from the house wallet to the stake
   * pool. Returns the Solana tx signature once confirmed.
   */
  async lockStake(): Promise<StakeReceipt> {
    const recipient = this.config.stakePoolPubkey.toBase58();
    const amountRaw = this.config.perPostAmountRaw.toString();

    let unsigned: { transaction: string };
    try {
      unsigned = await this.config.client.buildTransfer({
        mint: this.config.mint.toBase58(),
        recipient,
        amount: amountRaw,
        private: true,
        memo: "blindsol-stake-bond",
      });
    } catch (err) {
      throw new StakeServiceError(`MagicBlock /v1/spl/transfer failed: ${describe(err)}`, err);
    }

    const txBuf = Buffer.from(unsigned.transaction, "base64");
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
      await this.config.connection.confirmTransaction(signature, "confirmed");
    } catch (err) {
      throw new StakeServiceError(`failed to submit transfer to Solana: ${describe(err)}`, err);
    }

    return {
      signature,
      amountRaw,
      recipient,
      privateSettlement: true,
    };
  }
}

/**
 * Sign a base64-decoded transaction (legacy or versioned) with the given keypair.
 * Returns the wire-ready serialized bytes.
 */
function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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
