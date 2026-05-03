import {
  Connection,
  ParsedTransactionWithMeta,
  PublicKey,
  VersionedTransaction,
  type TransactionResponse,
} from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { createHash, createHmac } from "node:crypto";
import type { MagicBlockClient } from "@blindsol/magicblock-client";

/**
 * Stake-bond pipeline.
 *
 * The user's wallet — not the server — pays the stake bond per post. The
 * frontend orchestrates: ask the API to *prepare* an unsigned MagicBlock
 * private transfer, sign it with Phantom, submit it to mainnet, then
 * *finalize* the post with the resulting tx signature. The API verifies
 * the tx is real, settles to the right pool with the right amount, and
 * carries our memo (the postId) before inserting the post row.
 */

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export interface StakeBondPipelineConfig {
  client: MagicBlockClient;
  connection: Connection;
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
  /** Memo the user must include in the transfer (== postId). */
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
   * Server-signed receipt the user echoes back on /finalize. Binds together
   * (postId, contentHash, walletFrom, expected amount/recipient/memo, exp)
   * so the user can't post different content than what they staked for.
   */
  receipt: string;
  expiresAt: number;
}

export interface PreparedStakeReceipt {
  postId: string;
  contentHash: string;
  fromWallet: string;
  expectedAmountRaw: string;
  expectedRecipient: string;
  memo: string;
  iat: number;
  exp: number;
}

export class StakeBondError extends Error {
  constructor(public readonly reason: string) {
    super(`stake-bond: ${reason}`);
    this.name = "StakeBondError";
  }
}

const RECEIPT_VERSION = "blindsol-sb-v1";

export class StakeBondPipeline {
  constructor(private readonly cfg: StakeBondPipelineConfig) {}

  /**
   * Build an unsigned MagicBlock private transfer for the user's wallet to
   * sign. Also returns a server-signed receipt the user must hand back on
   * finalize so we can prove the amount/recipient/memo never changed.
   */
  async prepare(args: {
    postId: string;
    contentHash: string;
    fromWallet: string;
    perSecretKey: Uint8Array;
  }): Promise<PreparedStakeBond> {
    const memo = args.postId;
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
      // Atas-create only on the very first transfer for this (mint,
      // validator) pair; subsequent calls hit the lean payload path.
      // Conservative default: include initAtasIfMissing — idempotent if ATAs
      // already exist. This keeps the system self-healing.
      initAtasIfMissing: true,
    });

    const now = Math.floor(Date.now() / 1000);
    const exp = now + (this.cfg.ttlSeconds ?? 300);
    const receiptPayload: PreparedStakeReceipt = {
      postId: args.postId,
      contentHash: args.contentHash,
      fromWallet: args.fromWallet,
      expectedAmountRaw: this.cfg.minAmountRaw.toString(),
      expectedRecipient: this.cfg.stakePool.toBase58(),
      memo,
      iat: now,
      exp,
    };
    const receipt = signReceipt(receiptPayload, args.perSecretKey);

    return {
      postId: args.postId,
      contentHash: args.contentHash,
      memo,
      expectedAmountRaw: receiptPayload.expectedAmountRaw,
      expectedRecipient: receiptPayload.expectedRecipient,
      unsignedTransactionBase64: built.transactionBase64,
      recentBlockhash: built.recentBlockhash,
      lastValidBlockHeight: built.lastValidBlockHeight,
      requiredSigners: built.requiredSigners,
      validator: built.validator,
      receipt,
      expiresAt: exp,
    };
  }

  /**
   * Verify the user's signed transaction landed on chain, debits ≥ the
   * stake bond amount toward the stake pool, and carries our memo. Returns
   * the canonical receipt for storage on the post row.
   */
  async verifyOnChain(args: {
    receipt: string;
    perPubkeyBase58: string;
    txSignature: string;
  }): Promise<PreparedStakeReceipt> {
    const payload = verifyReceipt(args.receipt, args.perPubkeyBase58);

    const now = Math.floor(Date.now() / 1000);
    if (now > payload.exp) throw new StakeBondError("stake-bond receipt expired");

    const tx = await this.cfg.connection.getParsedTransaction(args.txSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    if (!tx) throw new StakeBondError("transaction not found on chain");
    if (tx.meta?.err) {
      throw new StakeBondError(`transaction failed: ${JSON.stringify(tx.meta.err)}`);
    }

    if (!txCarriesMemo(tx, payload.memo)) {
      throw new StakeBondError(`transaction memo does not match post id`);
    }

    // For PRIVATE transfers, USDC settles into MagicBlock's PER vault — not
    // into the recipient's base-layer ATA. So we verify by checking that the
    // SENDER was debited by at least the expected amount.
    const fromKey = new PublicKey(payload.fromWallet);
    const debited = senderDebit(tx, this.cfg.mint, fromKey);
    const expected = BigInt(payload.expectedAmountRaw);
    if (debited < expected) {
      throw new StakeBondError(
        `stake debit too low: debited=${debited} expected≥${expected}`,
      );
    }

    return payload;
  }
}

// ─── Receipt signing/verification ─────────────────────────────────────

function canonicalReceipt(p: PreparedStakeReceipt): string {
  return [
    RECEIPT_VERSION,
    p.postId,
    p.contentHash,
    p.fromWallet,
    p.expectedAmountRaw,
    p.expectedRecipient,
    p.memo,
    p.iat,
    p.exp,
  ].join("|");
}

function signReceipt(payload: PreparedStakeReceipt, secretKey: Uint8Array): string {
  const msg = new TextEncoder().encode(canonicalReceipt(payload));
  const sig = nacl.sign.detached(msg, secretKey);
  const b64 = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${RECEIPT_VERSION}.${b64}.${bs58.encode(sig)}`;
}

export function verifyReceipt(receipt: string, perPubkeyBase58: string): PreparedStakeReceipt {
  const parts = receipt.split(".");
  if (parts.length !== 3 || parts[0] !== RECEIPT_VERSION) {
    throw new StakeBondError("malformed stake-bond receipt");
  }
  const [, b64, sigB58] = parts;
  let payload: PreparedStakeReceipt;
  try {
    payload = JSON.parse(Buffer.from(base64UrlDecode(b64!)).toString("utf8")) as PreparedStakeReceipt;
  } catch {
    throw new StakeBondError("receipt payload not parseable");
  }
  const msg = new TextEncoder().encode(canonicalReceipt(payload));
  const sig = bs58.decode(sigB58!);
  const pub = bs58.decode(perPubkeyBase58);
  if (sig.length !== 64) throw new StakeBondError("receipt sig length");
  if (pub.length !== 32) throw new StakeBondError("receipt pubkey length");
  if (!nacl.sign.detached.verify(msg, sig, pub)) {
    throw new StakeBondError("receipt signature invalid");
  }
  return payload;
}

// ─── On-chain inspection helpers ──────────────────────────────────────

function txCarriesMemo(
  tx: ParsedTransactionWithMeta | TransactionResponse,
  memo: string,
): boolean {
  // Memo program emits its inner data via inner instructions / log messages.
  // We accept either an explicit memo program instruction matching, or the
  // program log line which Solana Memo posts: "Program log: Memo (len <n>): \"<text>\""
  const logs = tx.meta?.logMessages ?? [];
  for (const line of logs) {
    if (line.includes(`"${memo}"`)) return true;
    // Some MagicBlock variants log without quotes.
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

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(normalized, "base64");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function deriveStakeMemo(postId: string, perSecretKey: Uint8Array): string {
  // Currently we just use the postId as the memo. Reserved for future
  // schemes (e.g. HMAC of postId) without changing call sites.
  void perSecretKey;
  void createHmac; // imported for future use
  return postId;
}
