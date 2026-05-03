import {
  Connection,
  ParsedTransactionWithMeta,
  PublicKey,
  type TransactionResponse,
} from "@solana/web3.js";
import { and, eq, isNull } from "drizzle-orm";
import { createHash, createHmac } from "node:crypto";
import type { MagicBlockClient } from "@blindsol/magicblock-client";
import { type DB, schema } from "../db/index.js";

/**
 * Stake-bond pipeline.
 *
 * The user's wallet — not the server — pays the stake bond per post. The
 * frontend orchestrates: ask the API to *prepare* an unsigned MagicBlock
 * private transfer, sign it with Phantom, submit it to mainnet, then
 * *finalize* the post with the resulting tx signature. The API verifies
 * the tx is real, settles to the right pool with the right amount, and
 * carries our memo (HMAC of the postId) before inserting the post row.
 *
 * Privacy properties guarded here:
 *   1. Memo on-chain is HMAC(perSecret, postId), not the postId itself —
 *      so an outside observer can't link wallet→post by reading the memo.
 *   2. The receipt returned to the user is an opaque uuid; the wallet
 *      address stays in our DB and never round-trips through the browser.
 *   3. The receipt row's `consumed_at` prevents replay.
 */

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export interface StakeBondPipelineConfig {
  client: MagicBlockClient;
  connection: Connection;
  db: DB;
  /** Where stake bonds settle. Receive-only — we never need its secret key. */
  stakePool: PublicKey;
  /** SPL mint to escrow (USDC by default). */
  mint: PublicKey;
  /** Minimum acceptable amount in raw token units. */
  minAmountRaw: bigint;
  /** Cluster string forwarded to MagicBlock (e.g. "mainnet" or "devnet"). */
  cluster: string;
  /** Seconds before a /prepare reservation expires. */
  ttlSeconds?: number;
}

export interface PreparedStakeBond {
  postId: string;
  /** sha256 of the post content the user typed. */
  contentHash: string;
  /** Memo the user must include in the transfer (HMAC, not the postId). */
  memo: string;
  /** Base-unit amount the user must transfer. */
  expectedAmountRaw: string;
  /** Recipient pubkey (the stake pool). */
  expectedRecipient: string;
  /** Base64 unsigned VersionedTransaction the user signs with their wallet. */
  unsignedTransactionBase64: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  requiredSigners: string[];
  validator: string;
  /**
   * Opaque uuid the user echoes back on /finalize. The wallet/HMAC payload
   * lives in `prepared_stake_bonds` keyed by this id; nothing about the
   * sender escapes the server.
   */
  receiptId: string;
  expiresAt: number;
}

/** Internal — what the DB row looks like once resolved. */
export interface ResolvedReceipt {
  postId: string;
  contentHash: string;
  fromWallet: string;
  expectedAmountRaw: string;
  expectedRecipient: string;
  memo: string;
  expiresAt: Date;
}

export class StakeBondError extends Error {
  constructor(public readonly reason: string) {
    super(`stake-bond: ${reason}`);
    this.name = "StakeBondError";
  }
}

export class StakeBondPipeline {
  constructor(private readonly cfg: StakeBondPipelineConfig) {}

  /**
   * Build an unsigned MagicBlock private transfer for the user's wallet to
   * sign. Persists the prepare context (wallet, memo, expected amount) to
   * `prepared_stake_bonds` and returns just the row id as the opaque
   * receipt — the wallet never travels back to the user.
   */
  async prepare(args: {
    postId: string;
    contentHash: string;
    fromWallet: string;
    perSecretKey: Uint8Array;
  }): Promise<PreparedStakeBond> {
    const memo = hmacMemo(args.postId, args.perSecretKey);
    const amount = Number(this.cfg.minAmountRaw);
    if (BigInt(amount) !== this.cfg.minAmountRaw) {
      throw new StakeBondError("min amount exceeds JS safe integer");
    }

    const built = await this.cfg.client.buildTransfer({
      from: args.fromWallet,
      to: this.cfg.stakePool.toBase58(),
      mint: this.cfg.mint.toBase58(),
      amount,
      visibility: "private",
      fromBalance: "base",
      toBalance: "base",
      cluster: this.cfg.cluster,
      memo,
      initAtasIfMissing: true,
    });

    const ttlSec = this.cfg.ttlSeconds ?? 300;
    const expiresAt = new Date(Date.now() + ttlSec * 1000);

    const [inserted] = await this.cfg.db
      .insert(schema.preparedStakeBonds)
      .values({
        postId: args.postId,
        fromWallet: args.fromWallet,
        contentHash: args.contentHash,
        expectedAmountRaw: this.cfg.minAmountRaw.toString(),
        expectedRecipient: this.cfg.stakePool.toBase58(),
        memo,
        expiresAt,
      })
      .returning();
    if (!inserted) throw new StakeBondError("failed to persist prepared stake bond");

    return {
      postId: args.postId,
      contentHash: args.contentHash,
      memo,
      expectedAmountRaw: this.cfg.minAmountRaw.toString(),
      expectedRecipient: this.cfg.stakePool.toBase58(),
      unsignedTransactionBase64: built.transactionBase64,
      recentBlockhash: built.recentBlockhash,
      lastValidBlockHeight: built.lastValidBlockHeight,
      requiredSigners: built.requiredSigners,
      validator: built.validator,
      receiptId: inserted.id,
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
    };
  }

  /**
   * Resolve the opaque receipt id, verify the on-chain tx debits the right
   * wallet by ≥ expected amount and carries our HMAC memo, and mark the
   * receipt consumed so it can't be replayed.
   */
  async verifyOnChain(args: {
    receiptId: string;
    txSignature: string;
  }): Promise<ResolvedReceipt> {
    const [row] = await this.cfg.db
      .select()
      .from(schema.preparedStakeBonds)
      .where(eq(schema.preparedStakeBonds.id, args.receiptId))
      .limit(1);
    if (!row) throw new StakeBondError("unknown receipt id");
    if (row.consumedAt) throw new StakeBondError("receipt already consumed");
    if (row.expiresAt.getTime() <= Date.now()) throw new StakeBondError("receipt expired");

    const tx = await this.cfg.connection.getParsedTransaction(args.txSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    if (!tx) throw new StakeBondError("transaction not found on chain");
    if (tx.meta?.err) {
      throw new StakeBondError(`transaction failed: ${JSON.stringify(tx.meta.err)}`);
    }

    if (!txCarriesMemo(tx, row.memo)) {
      throw new StakeBondError("transaction memo does not match prepare");
    }

    // Private transfers settle into the PER vault, not the recipient ATA,
    // so verify by checking that the SENDER was debited by ≥ expected.
    const fromKey = new PublicKey(row.fromWallet);
    const debited = senderDebit(tx, this.cfg.mint, fromKey);
    const expected = BigInt(row.expectedAmountRaw);
    if (debited < expected) {
      throw new StakeBondError(
        `stake debit too low: debited=${debited} expected≥${expected}`,
      );
    }

    // Mark consumed atomically so a concurrent /finalize for the same
    // receipt id can't both succeed.
    const consumedAt = new Date();
    const updated = await this.cfg.db
      .update(schema.preparedStakeBonds)
      .set({ consumedAt })
      .where(
        and(
          eq(schema.preparedStakeBonds.id, args.receiptId),
          isNull(schema.preparedStakeBonds.consumedAt),
        ),
      )
      .returning();
    if (updated.length === 0) {
      // Lost the race — another finalize already consumed the receipt.
      throw new StakeBondError("receipt already consumed");
    }

    return {
      postId: row.postId,
      contentHash: row.contentHash,
      fromWallet: row.fromWallet,
      expectedAmountRaw: row.expectedAmountRaw,
      expectedRecipient: row.expectedRecipient,
      memo: row.memo,
      expiresAt: row.expiresAt,
    };
  }
}

// ─── Memo derivation ──────────────────────────────────────────────────

function hmacMemo(postId: string, perSecretKey: Uint8Array): string {
  return createHmac("sha256", Buffer.from(perSecretKey)).update(postId).digest("hex");
}

// ─── On-chain inspection helpers ──────────────────────────────────────

function txCarriesMemo(
  tx: ParsedTransactionWithMeta | TransactionResponse,
  memo: string,
): boolean {
  const logs = tx.meta?.logMessages ?? [];
  for (const line of logs) {
    if (line.includes(`"${memo}"`)) return true;
    if (line.includes(memo)) return true;
  }
  const messageInstructions =
    "transaction" in tx && "message" in tx.transaction
      ? "instructions" in tx.transaction.message
        ? (tx.transaction.message.instructions as Array<{ programId?: PublicKey; data?: string; parsed?: { type?: string } }>)
        : []
      : [];
  for (const ix of messageInstructions) {
    if (ix.programId && ix.programId.equals(MEMO_PROGRAM_ID) && typeof ix.data === "string") {
      if (ix.data.includes(memo)) return true;
    }
  }
  return false;
}

/**
 * How much SPL `mint` left the sender's token accounts in this tx. Used to
 * verify private transfers: the recipient's base-layer ATA never receives
 * funds (settlement happens inside the PER), so we check the sender debit.
 */
function senderDebit(
  tx: ParsedTransactionWithMeta | TransactionResponse,
  mint: PublicKey,
  sender: PublicKey,
): bigint {
  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];
  const senderStr = sender.toBase58();
  const mintStr = mint.toBase58();

  let preAmount = 0n;
  for (const b of pre) {
    if (b.owner === senderStr && b.mint === mintStr) {
      preAmount = BigInt(b.uiTokenAmount.amount);
    }
  }
  let postAmount = 0n;
  for (const b of post) {
    if (b.owner === senderStr && b.mint === mintStr) {
      postAmount = BigInt(b.uiTokenAmount.amount);
    }
  }
  return preAmount > postAmount ? preAmount - postAmount : 0n;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
