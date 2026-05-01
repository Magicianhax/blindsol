# AgentPay

Private x402 payment rails for AI agents, powered by [MagicBlock](https://docs.magicblock.gg/) Private Payments API.

> **Submission**: Colosseum Frontier Hackathon — Privacy Track (MagicBlock).

## Why

[x402](https://x402.org) is the emerging HTTP protocol for AI agents to pay each other for API access. On Solana today, every settlement is public — competitors can watch an agent's spend, infer its strategy, and frontrun it. **AgentPay makes x402 settlements private by default**, using MagicBlock's Private Ephemeral Rollup so there is no traceable on-chain link between agent and service.

## Architecture

```
┌─────────┐   1. GET /api          ┌──────────┐
│  Agent  │ ─────────────────────▶ │  Proxy   │ ──▶ /v1/spl/private-balance
│ (Claude)│ ◀─ 2. 402 + challenge ─│ (x402)   │
│         │                        │          │
│         │   3. private settle    │          │
│         │ ─── via /v1/mcp ─────▶ MagicBlock PER (TEE)
│         │                        │          │
│         │   4. retry with proof  │          │ 5. forward
│         │ ─────────────────────▶ │          │ ──▶ Demo API
└─────────┘ ◀─ 6. 200 + data ──── └──────────┘
```

## Apps

| Path | Purpose |
|---|---|
| `apps/proxy` | x402 reverse proxy that gates any API behind private USDC payment |
| `apps/demo-api` | Toy "premium oracle" priced at 0.01 USDC per call |
| `apps/agent` | Claude agent that consumes the API, paying privately via MCP |
| `apps/web` | Live dashboard showing private settlements |
| `packages/magicblock-client` | Shared TS client for MagicBlock Private Payments API |

## Getting started

```bash
pnpm install
cp .env.example .env
# fill in AGENT_WALLET_SECRET, MERCHANT_WALLET_SECRET, ANTHROPIC_API_KEY
pnpm dev
```

## Status

See [`tasks/todo.md`](./tasks/todo.md) for the implementation plan.

## License

MIT
