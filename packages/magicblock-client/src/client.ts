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
  /** Optional — only required for the auth flow used by private-balance reads. */
  signer?: WalletSigner;
  fetchImpl?: typeof fetch;
  /** Default cluster passed to all endpoints (`mainnet`, `devnet`, or a custom RPC URL). */
  cluster?: string;
}

/**
 * Source / destination location for an SPL transfer.
 *   - `base`      → the SPL token account on Solana mainnet/devnet
 *   - `ephemeral` → the SPL token account inside the Ephemeral Rollup
 */
export type Balance = "base" | "ephemeral";

export type TransferVisibility = "public" | "private";

export interface BuildTransferRequest {
  from: string;
  to: string;
  mint: string;
  /** Base-unit integer (USDC has 6 decimals → 1 USDC = 1_000_000). */
  amount: number;
  visibility: TransferVisibility;
  fromBalance: Balance;
  toBalance: Balance;
  cluster?: string;
  validator?: string;
  initIfMissing?: boolean;
  initAtasIfMissing?: boolean;
  initVaultIfMissing?: boolean;
  memo?: string;
  /** Private only. Min delay before settlement (ms, numeric string). */
  minDelayMs?: string;
  /** Private only. Max delay before settlement (ms, numeric string). */
  maxDelayMs?: string;
  /** Private only. Encrypted client-side reference id (numeric string). */
  clientRefId?: string;
  /** Private only. Split into N sub-transfers for timing obfuscation (1-15). */
  split?: number;
  /** When true, the API uses a sponsor as fee payer. */
  gasless?: boolean;
  /** Force a legacy transaction (skip lookup-table compilation). */
  legacy?: boolean;
}

export interface BuildDepositRequest {
  owner: string;
  amount: number;
  mint?: string;
  cluster?: string;
  validator?: string;
  initIfMissing?: boolean;
  initVaultIfMissing?: boolean;
  initAtasIfMissing?: boolean;
  idempotent?: boolean;
}

export interface BuildWithdrawRequest {
  owner: string;
  mint: string;
  amount: number;
  cluster?: string;
  validator?: string;
  initIfMissing?: boolean;
  initAtasIfMissing?: boolean;
  escrowIndex?: number;
  idempotent?: boolean;
}

export interface UnsignedTransactionResponse {
  kind: "transfer" | "deposit" | "withdraw" | "initializeMint";
  version: "legacy" | "v0";
  /** Base64-encoded serialized unsigned Solana transaction. */
  transactionBase64: string;
  sendTo: Balance;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  instructionCount: number;
  requiredSigners: string[];
  validator: string;
}

const DEFAULT_API_BASE = "https://payments.magicblock.app";

/**
 * Thin wrapper around the MagicBlock Private Payments REST API.
 *
 * The API is stateless — it builds unsigned transactions; the caller signs
 * and submits. Authentication is only required for endpoints that read
 * private data (e.g. `/v1/spl/private-balance`); standard transfer/deposit/
 * withdraw flows do not need a bearer token.
 */
export class MagicBlockClient {
  private readonly fetchImpl: typeof fetch;
  private session: AuthSession | undefined;

  constructor(private readonly config: MagicBlockClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  static withDefaults(): MagicBlockClient {
    return new MagicBlockClient({ apiBase: DEFAULT_API_BASE });
  }

  // ─── Auth (optional) ───────────────────────────────────────────────

  /**
   * Run the full challenge → sign → login flow and cache the bearer token.
   * Only needed for `/v1/spl/private-balance` (and `/v1/spl/transfer` when
   * routing through the Private ER).
   */
  async login(): Promise<AuthSession> {
    if (this.session) return this.session;
    if (!this.config.signer) {
      throw new Error("MagicBlockClient.login(): no signer configured");
    }

    const pubkey = await this.config.signer.publicKey();
    const { challenge } = await this.getJson<ChallengeResponse>(
      this.withCommonQuery(`/v1/spl/challenge?pubkey=${encodeURIComponent(pubkey)}`),
    );
    const signature = await this.config.signer.signMessage(challenge);
    const { token } = await this.postJson<LoginResponse>(this.withCommonQuery("/v1/spl/login"), {
      pubkey,
      challenge,
      signature,
    });

    this.session = { pubkey, bearerToken: token };
    return this.session;
  }

  resetSession(): void {
    this.session = undefined;
  }

  // ─── Reads ─────────────────────────────────────────────────────────

  async balance(args: { address: string; mint: string; cluster?: string }): Promise<BalanceResult> {
    const params = new URLSearchParams({
      address: args.address,
      mint: args.mint,
    });
    if (args.cluster ?? this.config.cluster) {
      params.set("cluster", args.cluster ?? this.config.cluster!);
    }
    return this.getJson<BalanceResult>(`/v1/spl/balance?${params.toString()}`);
  }

  async privateBalance(args: { address: string; mint: string; cluster?: string }): Promise<BalanceResult> {
    const session = await this.login();
    const params = new URLSearchParams({
      address: args.address,
      mint: args.mint,
    });
    if (args.cluster ?? this.config.cluster) {
      params.set("cluster", args.cluster ?? this.config.cluster!);
    }
    return this.getJson<BalanceResult>(`/v1/spl/private-balance?${params.toString()}`, {
      Authorization: `Bearer ${session.bearerToken}`,
    });
  }

  // ─── Builders ──────────────────────────────────────────────────────

  /**
   * Build an unsigned transfer transaction. Public transfers are pure
   * SPL token transfers; private transfers route through the PER and may
   * include `split` and delay obfuscation.
   *
   * Auth is only required when the request needs to connect to the Private
   * ER (e.g. when reading private state). Pure base→base private transfers
   * usually do not need auth.
   */
  async buildTransfer(req: BuildTransferRequest, opts?: { bearerToken?: string }): Promise<UnsignedTransactionResponse> {
    const headers: Record<string, string> = {};
    if (opts?.bearerToken) headers.Authorization = `Bearer ${opts.bearerToken}`;
    return this.postJson<UnsignedTransactionResponse>(
      this.withCommonQuery("/v1/spl/transfer"),
      this.attachClusterDefault(req),
      headers,
    );
  }

  async buildDeposit(req: BuildDepositRequest): Promise<UnsignedTransactionResponse> {
    return this.postJson<UnsignedTransactionResponse>(
      this.withCommonQuery("/v1/spl/deposit"),
      this.attachClusterDefault(req),
    );
  }

  async buildWithdraw(req: BuildWithdrawRequest): Promise<UnsignedTransactionResponse> {
    return this.postJson<UnsignedTransactionResponse>(
      this.withCommonQuery("/v1/spl/withdraw"),
      this.attachClusterDefault(req),
    );
  }

  // ─── Internals ─────────────────────────────────────────────────────

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

  private withCommonQuery(path: string): string {
    if (!this.config.cluster) return path;
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}cluster=${encodeURIComponent(this.config.cluster)}`;
  }

  private attachClusterDefault<T extends { cluster?: string }>(req: T): T {
    if (req.cluster || !this.config.cluster) return req;
    return { ...req, cluster: this.config.cluster };
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
