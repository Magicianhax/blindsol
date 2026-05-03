import { describe, it, expect, vi } from "vitest";
import { Connection, PublicKey } from "@solana/web3.js";
import { StakeBondError, StakeBondPipeline, sha256Hex } from "../../src/posts/stake-bond.js";
import type { MagicBlockClient } from "@blindsol/magicblock-client";
import type { DB } from "../../src/db/index.js";

const STAKE_POOL = new PublicKey("FArDvPVnE9JLHPQwzUXeqRkHuirBwuSwNKQJvDx1pwtZ");
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

const PER_SECRET = new Uint8Array(64).fill(7); // deterministic test secret

function fakeClient(buildTransfer: any): MagicBlockClient {
  return { buildTransfer } as unknown as MagicBlockClient;
}

function fakeConnection(getParsedTransaction: any = vi.fn()): Connection {
  return { getParsedTransaction } as unknown as Connection;
}

/**
 * Minimal in-memory fake of the Drizzle DB interface used by the
 * StakeBondPipeline. Drizzle conditions (`eq`, `and`, `isNull`) wrap
 * symbols that don't survive JSON.stringify, so we don't try to match by
 * id — we just assume each test exercises one row at a time and operate
 * on whatever single row the table holds.
 */
function fakeDb() {
  const rows: Map<string, any> = new Map();
  let idCounter = 0;

  const oneRow = () => [...rows.values()][0];

  const db: any = {
    insert(_table: any) {
      return {
        values(payload: any) {
          return {
            async returning() {
              const id = `rec-${++idCounter}`;
              const row = { id, consumedAt: null, ...payload };
              rows.set(id, row);
              return [row];
            },
          };
        },
      };
    },
    select(_columns?: any) {
      return {
        from(_table: any) {
          return {
            where(_condition: any) {
              return {
                async limit(_n: number) {
                  const row = oneRow();
                  return row ? [row] : [];
                },
              };
            },
          };
        },
      };
    },
    update(_table: any) {
      return {
        set(patch: any) {
          return {
            where(_condition: any) {
              return {
                async returning() {
                  const row = oneRow();
                  if (!row) return [];
                  // Honour the `consumed_at IS NULL` race guard.
                  if (row.consumedAt) return [];
                  Object.assign(row, patch);
                  return [row];
                },
              };
            },
          };
        },
      };
    },
    _rows: rows,
  };

  return db as DB & { _rows: Map<string, any> };
}

describe("StakeBondPipeline.prepare", () => {
  it("inserts a row, returns an opaque receipt id, never echoes the wallet back", async () => {
    const buildTransfer = vi.fn().mockResolvedValue({
      kind: "transfer",
      version: "v0",
      transactionBase64: "BASE64TX",
      sendTo: "base",
      recentBlockhash: "BH",
      lastValidBlockHeight: 1,
      instructionCount: 1,
      requiredSigners: ["USERWALLET"],
      validator: "VALIDATOR",
    });
    const db = fakeDb();
    const pipeline = new StakeBondPipeline({
      client: fakeClient(buildTransfer),
      connection: fakeConnection(),
      db,
      stakePool: STAKE_POOL,
      mint: USDC,
      minAmountRaw: 50000n,
      cluster: "mainnet",
    });

    const result = await pipeline.prepare({
      postId: "00000000-0000-0000-0000-000000000aaa",
      contentHash: sha256Hex("hello"),
      fromWallet: "3L5MtHhAGHSw35jxd5wQXBXXQ23a46UzEJKxoPct44Ji",
      perSecretKey: PER_SECRET,
    });

    expect(result.receiptId).toMatch(/^rec-/);
    // The memo on-chain must be the HMAC, NOT the post id.
    expect(result.memo).not.toBe(result.postId);
    expect(result.memo).toMatch(/^[a-f0-9]{64}$/);
    // Public response carries no wallet field.
    expect(JSON.stringify(result)).not.toContain("3L5MtHhAGHSw35jxd5wQXBXXQ23a46UzEJKxoPct44Ji");

    // The DB row holds the wallet (server-side).
    const row = [...db._rows.values()][0];
    expect(row.fromWallet).toBe("3L5MtHhAGHSw35jxd5wQXBXXQ23a46UzEJKxoPct44Ji");
    expect(row.memo).toBe(result.memo);
  });
});

describe("StakeBondPipeline.verifyOnChain", () => {
  function setup(txMeta: any) {
    const db = fakeDb();
    const pipeline = new StakeBondPipeline({
      client: fakeClient(vi.fn().mockResolvedValue({
        transactionBase64: "T",
        recentBlockhash: "BH",
        lastValidBlockHeight: 1,
        requiredSigners: ["U"],
        validator: "V",
      })),
      connection: fakeConnection(vi.fn().mockResolvedValue({ meta: txMeta })),
      db,
      stakePool: STAKE_POOL,
      mint: USDC,
      minAmountRaw: 50000n,
      cluster: "mainnet",
    });
    return { db, pipeline };
  }

  it("rejects an unknown receipt id", async () => {
    const { pipeline } = setup({});
    await expect(
      pipeline.verifyOnChain({ receiptId: "rec-9999", txSignature: "sig-1234567890123456789012345678901234" }),
    ).rejects.toBeInstanceOf(StakeBondError);
  });

  it("succeeds when sender debit and memo match, then refuses replay", async () => {
    const { db, pipeline } = setup({});

    const prep = await pipeline.prepare({
      postId: "00000000-0000-0000-0000-000000000bbb",
      contentHash: sha256Hex("body"),
      fromWallet: "3L5MtHhAGHSw35jxd5wQXBXXQ23a46UzEJKxoPct44Ji",
      perSecretKey: PER_SECRET,
    });

    // Stub a tx whose memo matches and whose sender ATA debits ≥ expected.
    pipeline["cfg"].connection.getParsedTransaction = vi.fn().mockResolvedValue({
      meta: {
        logMessages: [`Program log: Memo (len 64): "${prep.memo}"`],
        preTokenBalances: [
          { owner: "3L5MtHhAGHSw35jxd5wQXBXXQ23a46UzEJKxoPct44Ji", mint: USDC.toBase58(), uiTokenAmount: { amount: "100000" } },
        ],
        postTokenBalances: [
          { owner: "3L5MtHhAGHSw35jxd5wQXBXXQ23a46UzEJKxoPct44Ji", mint: USDC.toBase58(), uiTokenAmount: { amount: "50000" } },
        ],
      },
      transaction: { message: { instructions: [] } },
    });

    const resolved = await pipeline.verifyOnChain({ receiptId: prep.receiptId, txSignature: "T" });
    expect(resolved.fromWallet).toBe("3L5MtHhAGHSw35jxd5wQXBXXQ23a46UzEJKxoPct44Ji");

    // Row marked consumed.
    const row = db._rows.get(prep.receiptId)!;
    expect(row.consumedAt).toBeInstanceOf(Date);

    // Replay attempt — should fail.
    await expect(
      pipeline.verifyOnChain({ receiptId: prep.receiptId, txSignature: "T" }),
    ).rejects.toThrow(/already consumed/);
  });

  it("rejects when sender debit is below the expected amount", async () => {
    const { pipeline } = setup({});
    const prep = await pipeline.prepare({
      postId: "00000000-0000-0000-0000-000000000ccc",
      contentHash: sha256Hex("body"),
      fromWallet: "3L5MtHhAGHSw35jxd5wQXBXXQ23a46UzEJKxoPct44Ji",
      perSecretKey: PER_SECRET,
    });
    pipeline["cfg"].connection.getParsedTransaction = vi.fn().mockResolvedValue({
      meta: {
        logMessages: [`"${prep.memo}"`],
        preTokenBalances: [
          { owner: "3L5MtHhAGHSw35jxd5wQXBXXQ23a46UzEJKxoPct44Ji", mint: USDC.toBase58(), uiTokenAmount: { amount: "60000" } },
        ],
        postTokenBalances: [
          { owner: "3L5MtHhAGHSw35jxd5wQXBXXQ23a46UzEJKxoPct44Ji", mint: USDC.toBase58(), uiTokenAmount: { amount: "59999" } },
        ],
      },
      transaction: { message: { instructions: [] } },
    });
    await expect(
      pipeline.verifyOnChain({ receiptId: prep.receiptId, txSignature: "T" }),
    ).rejects.toThrow(/stake debit too low/);
  });

  it("rejects when the on-chain memo does not match", async () => {
    const { pipeline } = setup({});
    const prep = await pipeline.prepare({
      postId: "00000000-0000-0000-0000-000000000ddd",
      contentHash: sha256Hex("body"),
      fromWallet: "3L5MtHhAGHSw35jxd5wQXBXXQ23a46UzEJKxoPct44Ji",
      perSecretKey: PER_SECRET,
    });
    pipeline["cfg"].connection.getParsedTransaction = vi.fn().mockResolvedValue({
      meta: {
        logMessages: [`Program log: Memo (len 64): "deadbeef"`],
        preTokenBalances: [
          { owner: "3L5MtHhAGHSw35jxd5wQXBXXQ23a46UzEJKxoPct44Ji", mint: USDC.toBase58(), uiTokenAmount: { amount: "100000" } },
        ],
        postTokenBalances: [
          { owner: "3L5MtHhAGHSw35jxd5wQXBXXQ23a46UzEJKxoPct44Ji", mint: USDC.toBase58(), uiTokenAmount: { amount: "50000" } },
        ],
      },
      transaction: { message: { instructions: [] } },
    });
    await expect(
      pipeline.verifyOnChain({ receiptId: prep.receiptId, txSignature: "T" }),
    ).rejects.toThrow(/memo does not match/);
  });
});
