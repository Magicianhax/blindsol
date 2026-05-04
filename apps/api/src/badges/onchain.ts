import {
  type Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash } from "node:crypto";

/**
 * Anchor program client for the BlindSol badge_registry program.
 *
 * We hand-encode instructions instead of relying on the Anchor TS client to
 * keep the runtime dependency surface small. Instruction layout:
 *   [0..8]   Anchor discriminator = sha256("global:<name>")[..8]
 *   [8..]    Borsh-encoded args
 */
export interface OnChainRegistryConfig {
  connection: Connection;
  programId: PublicKey;
  /** Authority that signs initializeRegistry + mintBadge. Pays rent. */
  authority: Keypair;
}

export interface MintBadgeResult {
  badgePubkey: string;
  signature: string;
  index: number;
}

const REGISTRY_SEED = Buffer.from("registry");
const BADGE_SEED = Buffer.from("badge");

const DISC_INITIALIZE_REGISTRY = Buffer.from([189, 181, 20, 17, 174, 57, 249, 59]);
const DISC_MINT_BADGE = Buffer.from([242, 234, 237, 183, 232, 245, 146, 1]);
const DISC_DELEGATE_BADGE = Buffer.from([98, 245, 155, 21, 22, 100, 186, 252]);
const DISC_REGISTRY_ACCOUNT = Buffer.from([47, 174, 110, 246, 184, 182, 252, 218]);
const DISC_BADGE_ACCOUNT = Buffer.from([40, 127, 162, 181, 177, 154, 1, 48]);

// MagicBlock Ephemeral Rollups Delegation program — same on every cluster
// (devnet/mainnet). Seeds are constants exported by the SDK.
const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh",
);
const BUFFER_SEED = Buffer.from("buffer");
const DELEGATION_RECORD_SEED = Buffer.from("delegation");
const DELEGATION_METADATA_SEED = Buffer.from("delegation-metadata");

export class OnChainBadgeRegistry {
  constructor(private readonly cfg: OnChainRegistryConfig) {}

  registryPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([REGISTRY_SEED], this.cfg.programId);
  }

  badgePda(kindBytes: Buffer, indexLe: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([BADGE_SEED, kindBytes, indexLe], this.cfg.programId);
  }

  async isInitialized(): Promise<boolean> {
    const [registry] = this.registryPda();
    const info = await this.cfg.connection.getAccountInfo(registry);
    return info !== null;
  }

  async initialize(): Promise<string> {
    const [registry] = this.registryPda();
    const ix = new TransactionInstruction({
      programId: this.cfg.programId,
      keys: [
        { pubkey: registry, isSigner: false, isWritable: true },
        { pubkey: this.cfg.authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: DISC_INITIALIZE_REGISTRY,
    });
    return this.sendIx(ix);
  }

  /** Read the registry's next_index counter. */
  async getNextIndex(): Promise<bigint> {
    const [registry] = this.registryPda();
    const info = await this.cfg.connection.getAccountInfo(registry);
    if (!info) throw new Error("registry not initialized");
    const data = info.data;
    // layout: [0..8]=discriminator, [8..40]=authority pubkey, [40..48]=next_index (u64 LE)
    if (!data.subarray(0, 8).equals(DISC_REGISTRY_ACCOUNT)) {
      throw new Error("registry account discriminator mismatch");
    }
    return data.readBigUInt64LE(40);
  }

  async mintBadge(args: { kind: string; ownerCommitment: Buffer }): Promise<MintBadgeResult> {
    const kindBytes = padTo32Bytes(args.kind);
    if (args.ownerCommitment.length !== 32) {
      throw new Error("ownerCommitment must be exactly 32 bytes");
    }

    const nextIndex = await this.getNextIndex();
    const indexLe = Buffer.alloc(8);
    indexLe.writeBigUInt64LE(nextIndex);

    const [registry] = this.registryPda();
    const [badge] = this.badgePda(kindBytes, indexLe);

    const data = Buffer.concat([DISC_MINT_BADGE, kindBytes, args.ownerCommitment]);

    const ix = new TransactionInstruction({
      programId: this.cfg.programId,
      keys: [
        { pubkey: registry, isSigner: false, isWritable: true },
        { pubkey: badge, isSigner: false, isWritable: true },
        { pubkey: this.cfg.authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    const signature = await this.sendIx(ix);
    return { badgePubkey: badge.toBase58(), signature, index: Number(nextIndex) };
  }

  /**
   * Delegate a freshly minted badge PDA to the MagicBlock Private Ephemeral
   * Rollup. After this CPI completes, the badge account is locked from L1's
   * perspective — any further mutations must go through the rollup.
   *
   * Account layout matches what the `#[delegate]` proc-macro generates on
   * the program side (see `programs/badge-registry/src/lib.rs`):
   *   1. authority (Signer, mut payer)         — pays rent for buffer/record/metadata
   *   2. badge (mut, the PDA being delegated)  — was created by mint_badge
   *   3. buffer_badge (mut, PDA[BUFFER, badge])
   *   4. delegation_record_badge (mut, PDA[DELEGATION, badge] in delegation prog)
   *   5. delegation_metadata_badge (mut, PDA[DELEGATION_METADATA, badge] in delegation prog)
   *   6. owner_program (= our program id, read-only)
   *   7. delegation_program (= DELEGATION_PROGRAM_ID, read-only)
   *   8. system_program
   *
   * Args (instruction data, after the 8-byte discriminator):
   *   - kind_bytes: [u8; 32]   — 32-byte zero-padded kind label
   *   - badge_index: u64 LE    — same index as mint_badge
   *   The program uses these to rebuild the seeds of the badge PDA so the
   *   delegation CPI can sign for it.
   */
  async delegateBadge(args: {
    kind: string;
    badgeIndex: number;
  }): Promise<{ signature: string }> {
    const kindBytes = padTo32Bytes(args.kind);
    const indexLe = Buffer.alloc(8);
    indexLe.writeBigUInt64LE(BigInt(args.badgeIndex));

    const [badge] = this.badgePda(kindBytes, indexLe);

    const [bufferBadge] = PublicKey.findProgramAddressSync(
      [BUFFER_SEED, badge.toBuffer()],
      this.cfg.programId,
    );
    const [delegationRecordBadge] = PublicKey.findProgramAddressSync(
      [DELEGATION_RECORD_SEED, badge.toBuffer()],
      DELEGATION_PROGRAM_ID,
    );
    const [delegationMetadataBadge] = PublicKey.findProgramAddressSync(
      [DELEGATION_METADATA_SEED, badge.toBuffer()],
      DELEGATION_PROGRAM_ID,
    );

    const data = Buffer.concat([DISC_DELEGATE_BADGE, kindBytes, indexLe]);

    const ix = new TransactionInstruction({
      programId: this.cfg.programId,
      keys: [
        { pubkey: this.cfg.authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: badge, isSigner: false, isWritable: true },
        { pubkey: bufferBadge, isSigner: false, isWritable: true },
        { pubkey: delegationRecordBadge, isSigner: false, isWritable: true },
        { pubkey: delegationMetadataBadge, isSigner: false, isWritable: true },
        { pubkey: this.cfg.programId, isSigner: false, isWritable: false },
        { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    const signature = await this.sendIx(ix);
    return { signature };
  }

  private async sendIx(ix: TransactionInstruction): Promise<string> {
    const { blockhash, lastValidBlockHeight } = await this.cfg.connection.getLatestBlockhash();
    const tx = new Transaction().add(ix);
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.cfg.authority.publicKey;
    tx.sign(this.cfg.authority);
    const signature = await this.cfg.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
    });
    await this.cfg.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    return signature;
  }
}

/** Pad a UTF-8 label to exactly 32 bytes (zero-filled). Anchor expects fixed-size arrays. */
export function padTo32Bytes(label: string): Buffer {
  const buf = Buffer.alloc(32);
  Buffer.from(label, "utf8").copy(buf, 0);
  return buf;
}

/** Compute sha256(anonSeed) commitment used as the on-chain owner anchor. */
export function ownerCommitmentFromSeed(anonSeedHex: string): Buffer {
  return createHash("sha256").update(Buffer.from(anonSeedHex, "hex")).digest();
}
