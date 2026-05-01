# BlindSol — Implementation Plan

> Anonymous gossip for crypto. Verified holders post anonymously, the wallet → anon_id link sealed in MagicBlock's TEE.
> Submission target: Colosseum Frontier Hackathon — Privacy Track. Deadline 2026-05-27.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  SOLANA MAINNET                                                 │
│  • badge NFTs (verifies "wallet X holds verified $JUP" status)  │
│  • stake escrow accounts (anti-spam bonds)                      │
│  • Merkle root of post integrity (periodic)                     │
└─────────────────────────────────────────────────────────────────┘
                           ▲   commit/settle
                           │
┌─────────────────────────────────────────────────────────────────┐
│  MAGICBLOCK PER (TEE)                                           │
│  • wallet ↔ anon_id mapping (encrypted, never leaves)           │
│  • HMAC secret used to derive anon_ids                          │
│  • signs post-attestations: "valid badge holder posted X"       │
└─────────────────────────────────────────────────────────────────┘
                           ▲   attestation
                           │
┌─────────────────────────────────────────────────────────────────┐
│  POSTGRES DB                                                    │
│  • posts, comments, reactions — indexed by anon_id only         │
│  • zero wallet info anywhere                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Repo layout

```
blindsol/
├── apps/
│   ├── api/              Express + Postgres + Drizzle ORM
│   ├── agent/            Claude moderation bot
│   └── web/              Next.js (wallet, badge claim, feed, composer)
├── packages/
│   └── magicblock-client/   reusable from previous direction
└── programs/
    ├── badge-program/    Anchor: badge NFT issuance
    └── stake-escrow/     Anchor: anti-spam bonds
```

## Decisions locked in

- **Wallet model**: Privy server wallets (production-grade). KeypairSigner fallback for dev.
- **Network**: MagicBlock Private Payments API mainnet beta + Solana mainnet beta.
- **DB**: Postgres + Drizzle ORM (type-safe, fast). Local: Docker. Prod: Neon.
- **Repo**: pnpm workspaces (kept).

## Phases (10 days, target ship by 2026-05-11)

- [x] Phase 0 — pivot to BlindSol, kill old plan
- [x] Phase 1 — scaffold (existing — kept)
- [x] Phase 2 — magicblock-client (existing — kept, 100% reusable)
- [ ] Phase 3 — restructure monorepo (task #10) ← *in progress*
- [ ] Phase 4 — Postgres schema + Drizzle migrations (task #11)
- [ ] Phase 5 — API scaffolding + read endpoints (task #12)
- [ ] Phase 6 — Badge issuance flow (task #13)
- [ ] Phase 7 — Post submission with PER attestation (task #14)
- [ ] Phase 8 — Reactions + threaded comments (task #15)
- [ ] Phase 9 — Web feed + composer (task #16)
- [ ] Phase 10 — Moderation agent + mainnet deploy (task #17)
- [ ] Phase 11 — Demo video + submit (task #18)

## API surface (incoming)

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | health check |
| `/posts` | GET | list posts (filter by badge_kind, paginate) |
| `/posts/:id` | GET | post + comments thread |
| `/posts` | POST | submit post (requires PER attestation) |
| `/posts/:id/comments` | POST | reply to post |
| `/posts/:id/reactions` | POST | upvote / downvote / spam-flag |
| `/badges/claim` | POST | start badge claim flow |
| `/badges/:id` | GET | badge details |

## DB schema (preview)

- `badges (id, kind, on_chain_pubkey, issued_at)` — no wallet column
- `posts (id, author_anon_id, badge_kind, content, content_hash, per_attestation, stake_lamports, created_at)`
- `comments (id, post_id, parent_id, author_anon_id, badge_kind, content, per_attestation, created_at)`
- `reactions (id, post_id, reactor_anon_id, kind, per_attestation, created_at)`

## Risks & mitigations

- **PER program complexity** — writing real Anchor + ER delegation is the hard part. Mitigation: Phase 6 ships with mock attestations issued by a dev keypair, real PER integration follows in Phase 10.
- **Privy SDK churn** — already abstracted behind `WalletSigner`, swap is one config change.
- **Postgres setup friction on Windows** — use Docker compose locally; fall back to Neon free tier if Docker is painful.
- **3-min video discipline** — script day 8 morning, record afternoon.

## Review section

_Filled in after each phase._
