export interface AuthSession {
  pubkey: string;
  bearerToken: string;
}

export interface BalanceResult {
  address: string;
  mint: string;
  ata: string;
  location: "base" | "ephemeral";
  /** Base-unit string (e.g. "1000000" = 1 USDC). */
  balance: string;
}

export interface ChallengeResponse {
  challenge: string;
}

export interface LoginResponse {
  token: string;
}

export class MagicBlockApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly endpoint: string,
    message: string,
  ) {
    super(`[${status}] ${endpoint}: ${message}`);
    this.name = "MagicBlockApiError";
  }
}
