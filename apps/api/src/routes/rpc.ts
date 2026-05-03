import { Router, type Router as ExpressRouter } from "express";

export interface RpcProxyConfig {
  upstreamUrl: string;
  /** Optional allow-list of JSON-RPC methods. When set, others are rejected. */
  allowedMethods?: ReadonlyArray<string>;
  fetchImpl?: typeof fetch;
}

const DEFAULT_ALLOWED: ReadonlyArray<string> = [
  // Methods the wallet adapter / wallet UX needs.
  "getLatestBlockhash",
  "getRecentBlockhash",
  "getFeeForMessage",
  "getSlot",
  "getEpochInfo",
  "getMinimumBalanceForRentExemption",
  "getAccountInfo",
  "getMultipleAccounts",
  "getProgramAccounts",
  "getBalance",
  "getTokenAccountsByOwner",
  "getTokenAccountBalance",
  "getSignatureStatuses",
  "getTransaction",
  "getParsedTransaction",
  "simulateTransaction",
  "sendTransaction",
  "isBlockhashValid",
];

/**
 * JSON-RPC pass-through that hides the upstream API key from the browser.
 * The browser POSTs JSON-RPC bodies to /rpc; we forward to Helius (or
 * whichever provider is configured) and return the response verbatim.
 *
 * - Allow-list of methods prevents the proxy from being abused as a
 *   general-purpose RPC bouncer.
 * - Strips suspicious headers (Authorization, Cookie) on the way out.
 */
export function rpcRouter(cfg: RpcProxyConfig): ExpressRouter {
  const router = Router();
  const allow = new Set(cfg.allowedMethods ?? DEFAULT_ALLOWED);
  const fetchFn = cfg.fetchImpl ?? fetch;

  router.post("/", async (req, res) => {
    try {
      const body = req.body;
      // Single request OR JSON-RPC batch
      const requests = Array.isArray(body) ? body : [body];
      for (const r of requests) {
        if (!r || typeof r.method !== "string" || !allow.has(r.method)) {
          res.status(400).json({
            jsonrpc: "2.0",
            id: r?.id ?? null,
            error: { code: -32601, message: `method not allowed: ${r?.method}` },
          });
          return;
        }
      }

      const upstream = await fetchFn(cfg.upstreamUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await upstream.text();
      res.status(upstream.status).set("Content-Type", "application/json").send(text);
    } catch (err) {
      res.status(502).json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: `rpc proxy upstream failed: ${(err as Error).message}`,
        },
      });
    }
  });

  return router;
}
