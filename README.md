# BlindSol

Anonymous gossip for crypto. Verified holders post anonymously. The wallet → post link is sealed inside MagicBlock's TEE and never leaves.

> **Submission**: Colosseum Frontier Hackathon — Privacy Track (MagicBlock).

## Why

[Blind](https://www.teamblind.com/) has 7M+ users because anonymous-but-verified communities work. Crypto Twitter has no equivalent. **BlindSol** lets you prove something about yourself (you hold $JUP, you work at Anthropic, you're a Solana Foundation employee) and post anonymously under that badge. Readers verify the claim is real; nobody — not even our DB — can trace the post back to your wallet.

## How privacy actually works

Three layers, each holds only what it should:

```
SOLANA MAINNET     → badge issuances (public),  stake escrow accts
MAGICBLOCK PER     → wallet ↔ anon_id mapping (encrypted, sealed in TEE)
POSTGRES DB        → posts, comments, reactions (all indexed by anon_id only)
```

- Postgres has no wallet column anywhere
- Solana sees badges (coarse — "wallet X is a verified $JUP holder") but never specific posts
- The wallet → anon_id derivation runs only inside the TEE
- DB leak ≠ identity leak

## Apps

| Path | Purpose |
|---|---|
| `apps/api` | Express + Postgres. Read endpoints, post submission, attestation verification |
| `apps/agent` | Claude moderation bot — flags spam, summarizes threads |
| `apps/web` | Next.js. Wallet connect, badge claim, feed, composer, threads |
| `packages/magicblock-client` | Shared TS client for MagicBlock's Private Payments API + WalletSigner abstraction |
| `programs/badge-program` | Anchor program: badge NFT issuance |
| `programs/stake-escrow` | Anchor program: anti-spam stake bonds |

## Getting started

```bash
pnpm install
cp .env.example .env
# fill in DATABASE_URL, PRIVY_APP_ID, PRIVY_APP_SECRET, ANTHROPIC_API_KEY
pnpm --filter @blindsol/api db:migrate
pnpm dev
```

## Status

See [`tasks/todo.md`](./tasks/todo.md) for the implementation plan.

## License

MIT
