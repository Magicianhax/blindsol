import { Connection, PublicKey } from "@solana/web3.js";

/**
 * Badge kind = a recognizable Solana token. Holding any non-zero amount of
 * the token at the time of claim qualifies the wallet for that badge.
 *
 * Adding a new badge kind is a 3-step change:
 *   1. add the kind to BadgeKind / BADGE_LABELS / KIND_TO_MINT below
 *   2. (optional) bump the route validator zod enum
 *   3. (optional) reflect it in the frontend BADGE_LABELS map
 */
export type BadgeKind =
  | "jup_holder"
  | "drift_holder"
  | "kmno_holder"
  | "ray_holder"
  | "orca_holder"
  | "tnsr_holder"
  | "bonk_holder"
  | "wif_holder"
  | "popcat_holder"
  | "mew_holder"
  | "pyth_holder"
  | "hnt_holder"
  | "rndr_holder";

export const BADGE_LABELS: Record<BadgeKind, string> = {
  jup_holder: "verified $JUP holder",
  drift_holder: "verified $DRIFT holder",
  kmno_holder: "verified $KMNO holder",
  ray_holder: "verified $RAY holder",
  orca_holder: "verified $ORCA holder",
  tnsr_holder: "verified $TNSR holder",
  bonk_holder: "verified $BONK holder",
  wif_holder: "verified $WIF holder",
  popcat_holder: "verified $POPCAT holder",
  mew_holder: "verified $MEW holder",
  pyth_holder: "verified $PYTH holder",
  hnt_holder: "verified $HNT holder",
  rndr_holder: "verified $RNDR holder",
};

const KIND_TO_MINT: Record<BadgeKind, PublicKey> = {
  jup_holder: new PublicKey("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"),
  drift_holder: new PublicKey("DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7"),
  kmno_holder: new PublicKey("KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS"),
  ray_holder: new PublicKey("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R"),
  orca_holder: new PublicKey("orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE"),
  tnsr_holder: new PublicKey("TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6"),
  bonk_holder: new PublicKey("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"),
  wif_holder: new PublicKey("EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm"),
  popcat_holder: new PublicKey("7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr"),
  mew_holder: new PublicKey("MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5"),
  pyth_holder: new PublicKey("HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3"),
  hnt_holder: new PublicKey("hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux"),
  rndr_holder: new PublicKey("rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof"),
};

export const BADGE_KINDS: ReadonlyArray<BadgeKind> = Object.keys(BADGE_LABELS) as BadgeKind[];

export interface EvidenceCheck {
  ok: boolean;
  reason?: string;
}

export interface EvidenceVerifier {
  check(args: { walletBase58: string; kind: BadgeKind }): Promise<EvidenceCheck>;
}

export class SolanaEvidenceVerifier implements EvidenceVerifier {
  constructor(private readonly connection: Connection) {}

  async check({ walletBase58, kind }: { walletBase58: string; kind: BadgeKind }): Promise<EvidenceCheck> {
    let owner: PublicKey;
    try {
      owner = new PublicKey(walletBase58);
    } catch {
      return { ok: false, reason: "invalid wallet pubkey" };
    }

    const mint = KIND_TO_MINT[kind];
    if (!mint) return { ok: false, reason: `unknown badge kind: ${kind}` };

    const accounts = await this.connection.getParsedTokenAccountsByOwner(owner, { mint });
    let total = BigInt(0);
    for (const a of accounts.value) {
      const raw = a.account.data.parsed?.info?.tokenAmount?.amount as string | undefined;
      if (raw) total += BigInt(raw);
    }
    if (total <= BigInt(0)) {
      return { ok: false, reason: `wallet holds no ${kind.replace("_holder", "").toUpperCase()} on mainnet` };
    }
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
