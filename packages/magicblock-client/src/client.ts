import type { MagicBlockClientConfig, AuthSession, BalanceResult } from "./types.js";

// Stub — implementation lands in Phase 2 (TDD).
export class MagicBlockClient {
  constructor(private readonly config: MagicBlockClientConfig) {}

  async login(): Promise<AuthSession> {
    throw new Error("Not implemented — Phase 2");
  }

  async balance(mint: string): Promise<BalanceResult> {
    void mint;
    throw new Error("Not implemented — Phase 2");
  }

  async privateBalance(mint: string, session: AuthSession): Promise<BalanceResult> {
    void mint;
    void session;
    throw new Error("Not implemented — Phase 2");
  }
}
