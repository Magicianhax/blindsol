export interface AuthSession {
  pubkey: string;
  bearerToken: string;
}

export interface BalanceResult {
  mint: string;
  amount: string;
  decimals: number;
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
