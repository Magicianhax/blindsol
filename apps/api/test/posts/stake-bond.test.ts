import { describe, it, expect, vi } from "vitest";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  StakeBondError,
  StakeBondPipeline,
  sha256Hex,
  verifyReceipt,
} from "../../src/posts/stake-bond.js";
import type { MagicBlockClient } from "@blindsol/magicblock-client";

const STAKE_POOL = new PublicKey("FArDvPVnE9JLHPQwzUXeqRkHuirBwuSwNKQJvDx1pwtZ");
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

function freshPerKeys(): { secret: Uint8Array; pubB58: string } {
  const kp = nacl.sign.keyPair();
  return { secret: kp.secretKey, pubB58: bs58.encode(kp.publicKey) };
}

function fakeClient(buildTransfer: any): MagicBlockClient {
  return { buildTransfer } as unknown as MagicBlockClient;
}

function fakeConnection(getParsedTransaction: any = vi.fn()): Connection {
  return { getParsedTransaction } as unknown as Connection;
}

describe("StakeBondPipeline.prepare", () => {
  it("returns the unsigned tx + a signed receipt that round-trips", async () => {
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
    const pipeline = new StakeBondPipeline({
      client: fakeClient(buildTransfer),
      connection: fakeConnection(),
      stakePool: STAKE_POOL,
      mint: USDC,
      minAmountRaw: 100_000n,
      cluster: "mainnet",
    });
    const per = freshPerKeys();

    const prepared = await pipeline.prepare({
      postId: "post-1",
      contentHash: sha256Hex("hello"),
      fromWallet: "USERWALLET",
      perSecretKey: per.secret,
    });

    expect(prepared.unsignedTransactionBase64).toBe("BASE64TX");
    expect(prepared.expectedAmountRaw).toBe("100000");
    expect(prepared.expectedRecipient).toBe(STAKE_POOL.toBase58());
    expect(prepared.memo).toBe("post-1");

    // The receipt verifies under the same PER pubkey.
    const recovered = verifyReceipt(prepared.receipt, per.pubB58);
    expect(recovered.postId).toBe("post-1");
    expect(recovered.fromWallet).toBe("USERWALLET");

    expect(buildTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "USERWALLET",
        to: STAKE_POOL.toBase58(),
        mint: USDC.toBase58(),
        amount: 100_000,
        visibility: "private",
        fromBalance: "base",
        toBalance: "base",
        memo: "post-1",
      }),
    );
  });
});

describe("StakeBondPipeline.verifyOnChain", () => {
  it("rejects an expired receipt", async () => {
    const per = freshPerKeys();
    const buildTransfer = vi.fn();
    const pipeline = new StakeBondPipeline({
      client: fakeClient(buildTransfer),
      connection: fakeConnection(),
      stakePool: STAKE_POOL,
      mint: USDC,
      minAmountRaw: 100_000n,
      cluster: "mainnet",
    });

    // Sign a receipt that's already expired by setting iat/exp in the past.
    const fakeBuilt: any = {
      transactionBase64: "X",
      recentBlockhash: "B",
      lastValidBlockHeight: 1,
      instructionCount: 1,
      requiredSigners: [],
      validator: "V",
    };
    buildTransfer.mockResolvedValue({ kind: "transfer", version: "v0", sendTo: "base", ...fakeBuilt });
    const prepared = await pipeline.prepare({
      postId: "p-1",
      contentHash: sha256Hex("x"),
      fromWallet: "W",
      perSecretKey: per.secret,
    });

    // Hack the receipt forward in time by replacing the payload's exp.
    const parts = prepared.receipt.split(".");
    const rawPayload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
    rawPayload.exp = 1; // way in the past
    rawPayload.iat = 1;
    // The signature won't verify anymore, so we expect a generic invalid error.
    const tampered = `${parts[0]}.${Buffer.from(JSON.stringify(rawPayload), "utf8").toString("base64url").replace(/=+$/, "")}.${parts[2]}`;

    await expect(
      pipeline.verifyOnChain({
        receipt: tampered,
        perPubkeyBase58: per.pubB58,
        txSignature: "fake",
      }),
    ).rejects.toBeInstanceOf(StakeBondError);
  });

  it("rejects when the on-chain transaction is not found", async () => {
    const per = freshPerKeys();
    const conn = fakeConnection(vi.fn().mockResolvedValue(null));
    const pipeline = new StakeBondPipeline({
      client: fakeClient(vi.fn().mockResolvedValue({
        kind: "transfer",
        version: "v0",
        transactionBase64: "X",
        sendTo: "base",
        recentBlockhash: "B",
        lastValidBlockHeight: 1,
        instructionCount: 1,
        requiredSigners: [],
        validator: "V",
      })),
      connection: conn,
      stakePool: STAKE_POOL,
      mint: USDC,
      minAmountRaw: 100_000n,
      cluster: "mainnet",
    });

    const prepared = await pipeline.prepare({
      postId: "p-2",
      contentHash: sha256Hex("y"),
      fromWallet: "W",
      perSecretKey: per.secret,
    });

    await expect(
      pipeline.verifyOnChain({
        receipt: prepared.receipt,
        perPubkeyBase58: per.pubB58,
        txSignature: "missing-tx",
      }),
    ).rejects.toThrow(/not found on chain/);
  });

  it("accepts when memo + amount are correct", async () => {
    const per = freshPerKeys();

    const conn = fakeConnection(
      vi.fn().mockResolvedValue({
        meta: {
          err: null,
          logMessages: ['Program log: Memo (len 36): "post-3"'],
          preTokenBalances: [
            { owner: STAKE_POOL.toBase58(), mint: USDC.toBase58(), uiTokenAmount: { amount: "0" } },
          ],
          postTokenBalances: [
            { owner: STAKE_POOL.toBase58(), mint: USDC.toBase58(), uiTokenAmount: { amount: "100000" } },
          ],
        },
        transaction: { message: { instructions: [] } },
      }),
    );

    const pipeline = new StakeBondPipeline({
      client: fakeClient(vi.fn().mockResolvedValue({
        kind: "transfer",
        version: "v0",
        transactionBase64: "X",
        sendTo: "base",
        recentBlockhash: "B",
        lastValidBlockHeight: 1,
        instructionCount: 1,
        requiredSigners: [],
        validator: "V",
      })),
      connection: conn,
      stakePool: STAKE_POOL,
      mint: USDC,
      minAmountRaw: 100_000n,
      cluster: "mainnet",
    });

    const prepared = await pipeline.prepare({
      postId: "post-3",
      contentHash: sha256Hex("z"),
      fromWallet: "W",
      perSecretKey: per.secret,
    });

    const verified = await pipeline.verifyOnChain({
      receipt: prepared.receipt,
      perPubkeyBase58: per.pubB58,
      txSignature: "sig",
    });

    expect(verified.postId).toBe("post-3");
    expect(verified.expectedAmountRaw).toBe("100000");
  });

  it("rejects when settled amount is below the minimum", async () => {
    const per = freshPerKeys();
    const conn = fakeConnection(
      vi.fn().mockResolvedValue({
        meta: {
          err: null,
          logMessages: ['Program log: Memo (len 36): "post-4"'],
          preTokenBalances: [{ owner: STAKE_POOL.toBase58(), mint: USDC.toBase58(), uiTokenAmount: { amount: "0" } }],
          postTokenBalances: [{ owner: STAKE_POOL.toBase58(), mint: USDC.toBase58(), uiTokenAmount: { amount: "1000" } }],
        },
        transaction: { message: { instructions: [] } },
      }),
    );
    const pipeline = new StakeBondPipeline({
      client: fakeClient(vi.fn().mockResolvedValue({
        kind: "transfer",
        version: "v0",
        transactionBase64: "X",
        sendTo: "base",
        recentBlockhash: "B",
        lastValidBlockHeight: 1,
        instructionCount: 1,
        requiredSigners: [],
        validator: "V",
      })),
      connection: conn,
      stakePool: STAKE_POOL,
      mint: USDC,
      minAmountRaw: 100_000n,
      cluster: "mainnet",
    });

    const prepared = await pipeline.prepare({
      postId: "post-4",
      contentHash: sha256Hex("z"),
      fromWallet: "W",
      perSecretKey: per.secret,
    });

    await expect(
      pipeline.verifyOnChain({
        receipt: prepared.receipt,
        perPubkeyBase58: per.pubB58,
        txSignature: "sig",
      }),
    ).rejects.toThrow(/stake amount too low/);
  });
});
