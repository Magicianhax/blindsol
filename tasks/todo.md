# AgentPay — Implementation Plan

> Private x402 payment rails for AI agents, powered by MagicBlock's Private Payments API.
> Submission target: Colosseum Privacy Track (deadline 2026-05-27).

## Decisions locked in
- **Wallet model**: server-held keypair for the demo. Document production migration path (user-provided seed) in README.
- **Network**: MagicBlock Private Payments API mainnet beta. Budget ~$5 USDC for end-to-end demo flows.
- **Repo**: pnpm workspaces.

## Architecture
```
agentpay/
├── apps/
│   ├── proxy/        x402 reverse proxy (Express + TS)
│   ├── demo-api/     toy "premium oracle" priced at 0.01 USDC/call
│   ├── agent/        Claude agent that pays via MagicBlock MCP
│   └── web/          Next.js dashboard (fork of private-payments-demo)
└── packages/
    └── magicblock-client/   shared lib: auth + balance + transfer
```

## Phases (10 days, ends 2026-05-11; submission window holds until 05-27)

- [x] Phase 0 — research & spec ✅ (this doc)
- [ ] Phase 1 — scaffold monorepo (task #1)
- [ ] Phase 2 — MagicBlock client lib + smoke test against mainnet beta (task #2)
- [ ] Phase 3 — x402 proxy middleware, TDD (task #3)
- [ ] Phase 4 — demo paid API (task #4)
- [ ] Phase 5 — Claude agent + MCP integration (task #5)
- [ ] Phase 6 — web dashboard (task #6)
- [ ] Phase 7 — mainnet deploy + smoke (task #7)
- [ ] Phase 8 — demo video (task #8)
- [ ] Phase 9 — README, polish, submit (task #9)

## API surface in scope
| Endpoint | Used by | Purpose |
|---|---|---|
| GET /v1/spl/challenge | client lib | wallet auth challenge |
| POST /v1/spl/login | client lib | bearer token |
| GET /v1/spl/balance | proxy, agent | base-chain USDC balance |
| GET /v1/spl/private-balance | proxy | settlement verification |
| POST /v1/spl/deposit | agent | onboard USDC into PER |
| POST /v1/spl/transfer | agent | private payment to merchant |
| POST /v1/spl/withdraw | merchant (later) | cash-out path |
| GET /v1/mcp | agent | MCP-native settlement |

## Risks & mitigations
- **Mainnet beta quirks not in docs** → keep one full day in buffer (Phase 7 day) for deploy debugging.
- **MCP endpoint behavior** → if /v1/mcp doesn't expose the verbs we need, fall back to direct REST calls from the agent. Demo still works.
- **3-min video discipline** → script it on day 8 morning, record afternoon. Don't ship features after day 7.

## Review section
_To be filled in after each phase._
