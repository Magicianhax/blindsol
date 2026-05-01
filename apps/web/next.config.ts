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
    ];
  },
};

export default config;
