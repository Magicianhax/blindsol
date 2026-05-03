export interface TokenMeta {
  symbol: string;
  label: string;
  color: string;
  mint: string;
  category: "DeFi" | "Memes" | "Infra";
}

const RAYDIUM_CDN = "https://img-v1.raydium.io/icon";

export const TOKENS: Record<string, TokenMeta> = {
  jup_holder: {
    symbol: "JUP",
    label: "verified $JUP holder",
    color: "#10b981",
    mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    category: "DeFi",
  },
  drift_holder: {
    symbol: "DRIFT",
    label: "verified $DRIFT holder",
    color: "#a855f7",
    mint: "DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7",
    category: "DeFi",
  },
  kmno_holder: {
    symbol: "KMNO",
    label: "verified $KMNO holder",
    color: "#3b82f6",
    mint: "KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS",
    category: "DeFi",
  },
  ray_holder: {
    symbol: "RAY",
    label: "verified $RAY holder",
    color: "#06b6d4",
    mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    category: "DeFi",
  },
  orca_holder: {
    symbol: "ORCA",
    label: "verified $ORCA holder",
    color: "#fbbf24",
    mint: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
    category: "DeFi",
  },
  tnsr_holder: {
    symbol: "TNSR",
    label: "verified $TNSR holder",
    color: "#f97316",
    mint: "TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6",
    category: "DeFi",
  },
  bonk_holder: {
    symbol: "BONK",
    label: "verified $BONK holder",
    color: "#f59e0b",
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    category: "Memes",
  },
  wif_holder: {
    symbol: "WIF",
    label: "verified $WIF holder",
    color: "#ec4899",
    mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    category: "Memes",
  },
  popcat_holder: {
    symbol: "POPCAT",
    label: "verified $POPCAT holder",
    color: "#facc15",
    mint: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
    category: "Memes",
  },
  mew_holder: {
    symbol: "MEW",
    label: "verified $MEW holder",
    color: "#8b5cf6",
    mint: "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5",
    category: "Memes",
  },
  pyth_holder: {
    symbol: "PYTH",
    label: "verified $PYTH holder",
    color: "#a78bfa",
    mint: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
    category: "Infra",
  },
  hnt_holder: {
    symbol: "HNT",
    label: "verified $HNT holder",
    color: "#06b6d4",
    mint: "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux",
    category: "Infra",
  },
  rndr_holder: {
    symbol: "RNDR",
    label: "verified $RNDR holder",
    color: "#ef4444",
    mint: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",
    category: "Infra",
  },
};

/**
 * Logo URL for a token. Uses Raydium's image CDN — single source, actively
 * maintained, covers every popular SPL mint by address.
 */
export function logoUrl(meta: TokenMeta): string {
  return `${RAYDIUM_CDN}/${meta.mint}.png`;
}

export const TOKEN_KINDS = Object.keys(TOKENS);
export const KINDS_BY_CATEGORY: Record<TokenMeta["category"], string[]> = {
  DeFi: TOKEN_KINDS.filter((k) => TOKENS[k]!.category === "DeFi"),
  Memes: TOKEN_KINDS.filter((k) => TOKENS[k]!.category === "Memes"),
  Infra: TOKEN_KINDS.filter((k) => TOKENS[k]!.category === "Infra"),
};

export function tokenFor(kind: string): TokenMeta | undefined {
  return TOKENS[kind];
}
