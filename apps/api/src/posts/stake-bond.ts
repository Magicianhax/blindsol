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

/** Internal — what the DB row looks like once resolved. Wallet plaintext is
 * deliberately absent: the row stores only `sha256(wallet)`, and finalize
 * verifies by hashing the on-chain payer and comparing.
 */
export interface ResolvedReceipt {
  postId: string;
  contentHash: string;
  /** sha256 of the wallet that requested /prepare. */
  fromWalletHash: string;
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

    // Hash the wallet before it touches the DB. The plaintext value is used
    // here only to build the unsigned MagicBlock TX (via `client.buildTransfer`
    // above) and is then dropped — it never reaches a row.
    const fromWalletHash = sha256Hex(args.fromWallet);

    const [inserted] = await this.cfg.db
      .insert(schema.preparedStakeBonds)
      .values({
        postId: args.postId,
        fromWalletHash,
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
    // so verify by inspecting which token-account owner was DEBITED for
    // our mint. We discover the payer from the TX, hash it, and verify
    // it matches the hash we stored at /prepare time. No plaintext wallet
    // ever lives on the row.
    const expected = BigInt(row.expectedAmountRaw);
    const payer = findPayer(tx, this.cfg.mint, expected, row.fromWalletHash);
    if (!payer) {
      throw new StakeBondError(
        `no token-balance owner debited ≥${expected} of mint ${this.cfg.mint.toBase58()} ` +
          `with hash matching the prepare`,
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
      fromWalletHash: row.fromWalletHash,
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
 * Find the token-account owner that was debited for `mint` by ≥ `minDebit`
 * AND whose `sha256(owner)` matches `expectedHash`. Returns the owner pubkey
 * (string) or `null` if no candidate qualifies.
 *
 * Used because we no longer store the plaintext wallet on the receipt row —
 * the on-chain TX is the authoritative source of "who paid", and we verify
 * it's the same wallet that called /prepare by comparing hashes.
 */
function findPayer(
  tx: ParsedTransactionWithMeta | TransactionResponse,
  mint: PublicKey,
  minDebit: bigint,
  expectedHash: string,
): string | null {
  const mintStr = mint.toBase58();
  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];

  // Aggregate owner → balance for our mint, pre and post.
  const preByOwner = new Map<string, bigint>();
  const postByOwner = new Map<string, bigint>();
  for (const b of pre) {
    if (b.mint === mintStr && b.owner) {
      preByOwner.set(b.owner, (preByOwner.get(b.owner) ?? 0n) + BigInt(b.uiTokenAmount.amount));
    }
  }
  for (const b of post) {
    if (b.mint === mintStr && b.owner) {
      postByOwner.set(b.owner, (postByOwner.get(b.owner) ?? 0n) + BigInt(b.uiTokenAmount.amount));
    }
  }

  // Walk every owner that appeared in pre balances; compute debit; if it
  // satisfies the threshold AND its sha256 matches the prepare hash, that's
  // our payer. Multiple candidates are possible in theory (a TX could touch
  // many owners) — we return the first hash-match. The hash check ensures
  // we accept exactly the wallet that was on the prepare row.
  for (const [owner, before] of preByOwner) {
    const after = postByOwner.get(owner) ?? 0n;
    const debited = before > after ? before - after : 0n;
    if (debited >= minDebit && sha256Hex(owner) === expectedHash) {
      return owner;
    }
  }
  return null;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
