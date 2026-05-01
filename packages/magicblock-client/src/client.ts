import type { WalletSigner } from "./signer.js";
import {
  type AuthSession,
  type BalanceResult,
  type ChallengeResponse,
  type LoginResponse,
  MagicBlockApiError,
} from "./types.js";

export interface MagicBlockClientConfig {
  apiBase: string;
  signer: WalletSigner;
  fetchImpl?: typeof fetch;
}

const DEFAULT_API_BASE = "https://payments.magicblock.app";

export class MagicBlockClient {
  private readonly fetchImpl: typeof fetch;
  private session: AuthSession | undefined;

  constructor(private readonly config: MagicBlockClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  static withDefaults(signer: WalletSigner): MagicBlockClient {
    return new MagicBlockClient({ apiBase: DEFAULT_API_BASE, signer });
  }

  /**
   * Run the full challenge → sign → login flow and cache the bearer token.
   * Idempotent — subsequent calls return the cached session.
   */
  async login(): Promise<AuthSession> {
    if (this.session) return this.session;

    const pubkey = await this.config.signer.publicKey();
    const { challenge } = await this.getJson<ChallengeResponse>(
      `/v1/spl/challenge?pubkey=${encodeURIComponent(pubkey)}`,
    );
    const signature = await this.config.signer.signMessage(challenge);
    const { token } = await this.postJson<LoginResponse>("/v1/spl/login", {
      pubkey,
      challenge,
      signature,
    });

    this.session = { pubkey, bearerToken: token };
    return this.session;
  }

  async balance(mint: string): Promise<BalanceResult> {
    const session = await this.login();
    return this.getJson<BalanceResult>(
      `/v1/spl/balance?mint=${encodeURIComponent(mint)}&address=${encodeURIComponent(session.pubkey)}`,
    );
  }

  async privateBalance(mint: string): Promise<BalanceResult> {
    const session = await this.login();
    return this.getJson<BalanceResult>(
      `/v1/spl/private-balance?mint=${encodeURIComponent(mint)}&address=${encodeURIComponent(session.pubkey)}`,
      { Authorization: `Bearer ${session.bearerToken}` },
    );
  }

  /** Force re-auth, e.g. after a 401. */
  resetSession(): void {
    this.session = undefined;
  }

  private async getJson<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
    const res = await this.fetchImpl(this.url(path), {
      method: "GET",
      headers: { Accept: "application/json", ...headers },
    });
    return this.parse<T>(res, path);
  }

  private async postJson<T>(
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const res = await this.fetchImpl(this.url(path), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return this.parse<T>(res, path);
  }

  private url(path: string): string {
    return `${this.config.apiBase.replace(/\/$/, "")}${path}`;
  }

  private async parse<T>(res: Response, endpoint: string): Promise<T> {
    if (!res.ok) {
      const text = await safeText(res);
      throw new MagicBlockApiError(res.status, endpoint, text || res.statusText);
    }
    return (await res.json()) as T;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
