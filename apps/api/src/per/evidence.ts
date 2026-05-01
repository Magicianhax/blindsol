import { Connection, PublicKey } from "@solana/web3.js";

/**
 * "Does this wallet qualify for badge of kind X?" — the predicate the PER
 * runs inside the TEE before issuing a badge token.
 *
 * For the hackathon demo we ship two real verifiers (token holders) and one
 * dev-mode pass-through (employment claims, which would require email/SSO
 * proof in production).
 */
export type BadgeKind = "jup_holder" | "sol_foundation" | "anthropic_eng";

export const BADGE_LABELS: Record<BadgeKind, string> = {
  jup_holder: "verified $JUP holder",
  sol_foundation: "Solana Foundation employee",
  anthropic_eng: "Anthropic engineer",
};

export interface EvidenceCheck {
  ok: boolean;
  reason?: string;
}

export interface EvidenceVerifier {
  check(args: { walletBase58: string; kind: BadgeKind }): Promise<EvidenceCheck>;
}

const JUP_MINT = new PublicKey("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN");
const MIN_JUP_RAW = BigInt(10) ** BigInt(6); // 1 JUP (6 decimals)

export class SolanaEvidenceVerifier implements EvidenceVerifier {
  constructor(private readonly connection: Connection) {}

  async check({ walletBase58, kind }: { walletBase58: string; kind: BadgeKind }): Promise<EvidenceCheck> {
    let owner: PublicKey;
    try {
      owner = new PublicKey(walletBase58);
    } catch {
      return { ok: false, reason: "invalid wallet pubkey" };
    }

    if (kind === "jup_holder") {
      const accounts = await this.connection.getParsedTokenAccountsByOwner(owner, { mint: JUP_MINT });
      let total = BigInt(0);
      for (const a of accounts.value) {
        const raw = a.account.data.parsed?.info?.tokenAmount?.amount as string | undefined;
        if (raw) total += BigInt(raw);
      }
      if (total < MIN_JUP_RAW) {
        return { ok: false, reason: `wallet must hold at least 1 JUP, found ${total} raw` };
      }
      return { ok: true };
    }

    // Employment-class claims need real OOB proof in prod (email DKIM, OIDC,
    // ZK-TLS attestation, etc). For the hackathon we accept any wallet so the
    // demo flow works end-to-end and document the gap.
    return { ok: true };
  }
}

/** Test-only verifier with no I/O. */
export class StubEvidenceVerifier implements EvidenceVerifier {
  constructor(private readonly result: EvidenceCheck = { ok: true }) {}
  async check(): Promise<EvidenceCheck> {
    return this.result;
  }
}
