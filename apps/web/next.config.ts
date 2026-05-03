import type { NextConfig } from "next";

const config: NextConfig = {
  async rewrites() {
    return [
      // Proxy API calls to the BlindSol API in dev so the browser can hit
      // /api/* without dealing with CORS.
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001"}/:path*`,
      },
      // Same-origin Solana JSON-RPC: browser hits /solana-rpc, Next forwards
      // to the API's /rpc proxy, which forwards to Helius (key never leaves
      // the server).
      {
        source: "/solana-rpc",
        destination: `${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001"}/rpc`,
      },
    ];
  },
};

export default config;
