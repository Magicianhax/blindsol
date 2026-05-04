<p align="center">
  <img src="assets/brand/blindSOL.png" alt="BlindSol logo" width="160" />
</p>

<h1 align="center">BlindSol</h1>

<p align="center">
  A small forum where verified token holders post anonymously. The wallet ↔ identity link is sealed inside MagicBlock's Private Ephemeral Rollup and never leaves the TEE.
</p>

Submission for **Colosseum Frontier Hackathon · Privacy Track (MagicBlock)**.

## Why this exists

Crypto Twitter is loud and unverified. Real holders self-censor because a wallet on the timeline becomes a wallet on a target list — front-runners, exes, regulators. Self-claimed shilling fills the gap.

BlindSol flips the trade-off: prove you hold (so your voice is verified) but stay anonymous (so your wallet stays your business). Hold $JUP → claim a `$JUP holder` badge → post under a stable anon handle that nobody can map back to your wallet. Sign in on any device with the same wallet and your handle, posts, and reputation come right back — no localStorage to lose, no email account, no password.

## How privacy works

Three layers, each holds only what it should:

<p align="center">
  <img src="assets/diagrams/privacy-stack.png" alt="BlindSol privacy stack — Solana mainnet, MagicBlock PER, Postgres" width="780" />
</p>

- The Postgres schema has **no wallet column** anywhere on posts/comments/reactions. The one place a wallet ever transited the DB (the stake-bond receipt row) now stores only `sha256(wallet)`, so a leaked DB can't be joined against the public anon list to recover wallets in bulk.
- The wallet → anon_id derivation runs inside the rollup as `anonId = HMAC(perSecret, wallet || badgeKind)`. Stable per-wallet/badge, unlinkable without the TEE secret. **Deterministic** — sign a fresh challenge from any device and you get the same anon back.
- USDC fees move through MagicBlock Private Payments — the chain sees a debit, not which post it paid for.
- After mint, the Badge account is **delegated** to MagicBlock's Private ER. Solana itself flips the on-chain owner from the `badge_registry` program to the Delegation program. Future state mutations (revoke, slash, expire) run privately inside the rollup's TEE at sub-50ms; only the final commits ever surface back to L1.
- Each post/comment/vote ships with an ed25519 attestation signed by the PER key. Even after deletion, the attestation chain proves the action came from a verified holder.

A long-form explainer with diagrams and the honest limitations lives at [`/about`](apps/web/src/app/about/page.tsx) in the running app.

## How a post happens

<p align="center">
  <img src="assets/diagrams/post-flow.png" alt="BlindSol post flow — claim badge once, then prepare, sign, finalize per post" width="780" />
</p>

The user wallet pays the fee. The server holds nothing that can dox anyone — it only inspects on-chain receipts.

In code:

1. `POST /badges/claim` — wallet signs a server-generated challenge; the TEE verifies on-chain holdings via Helius RPC, mints a Badge account on Solana via the Anchor `badge_registry` program, **immediately delegates that Badge account to MagicBlock's PER**, and returns a 24h ed25519 badge token.
2. `POST /posts/prepare` — server builds an unsigned MagicBlock private USDC transfer ($0.05 from user → stake pool, `base→base`, `visibility:"private"`) and stores `sha256(fromWallet)` in `prepared_stake_bonds`. Returns `{ unsignedTx, receiptId, postId }`.
3. User signs the tx in Phantom and broadcasts it. The transfer settles into the PER vault, attributed to the stake pool.
4. `POST /posts/finalize` — server fetches the on-chain tx, finds the actual payer from pre/post token balances, verifies `sha256(payer) == row.fromWalletHash` AND debit ≥ expected AND memo matches, then INSERTs the post with `title`, `content`, `contentHash`, `perAttestation`.

### Cross-device sign-in (no account needed)

1. `GET /auth/challenge` — server issues a single-use nonce + canonical message (TTL 5 min, stored in `auth_challenges`).
2. Client wallet signs `BlindSol sign-in — nonce <nonce> — expires <ts>`.
3. `POST /auth/sign-in` — server atomically consumes the nonce, verifies the signature, derives `anonId = HMAC(perSecret, wallet || kind)` for every supported kind, looks up `badges WHERE anon_id IN (...)`, **re-checks on-chain holdings per candidate** (sold the bag → posting rights end), and returns fresh badge tokens. Wallet enters the HMAC and is dropped — never persists.

## Project layout

```
apps/
  api/         Express + Drizzle. Read endpoints, prepare/finalize post pipeline,
               badge issuance, /auth challenge+sign-in, attestation signing,
               audit log. Talks to MagicBlock for private payments + delegation.
  web/         Next.js 15 App Router. Privy wallet auth, dark/acid terminal UI,
               HoloSeal sigil per anon, badge purse, composer, threaded comments,
               profile, /about explainer page. Light theme via [data-theme="light"].
packages/
  magicblock-client/   TS client for MagicBlock Private Payments + auth helpers.
programs/
  badge-registry/      Anchor program. mint_badge + delegate_badge +
                       undelegate_badge instructions. Uses ephemeral-rollups-sdk
                       0.2.x to delegate state to the Private ER. Live on devnet
                       at Gm6YCG…XU; promote to mainnet when ready.
assets/
  brand/               Source brand assets (logo PNG). build-icons.py derives
                       /apps/web/public/blindSOL.png and the favicon variants.
  diagrams/            privacy-stack + post-flow diagrams (Excalidraw exports).
```

## Stack

- **Frontend** — Next.js 15, Tailwind, Privy (wallet-only auth, no email/social), JetBrains Mono + Space Grotesk fonts (dark/acid terminal theme with light "paper" override).
- **Backend** — Express, Drizzle ORM, Neon Postgres.
- **Privacy** — MagicBlock Private Ephemeral Rollup (state delegation + attestations) + Private Payments API.
- **On-chain** — Solana mainnet (USDC fee settlement), Anchor `badge_registry` (devnet).
- **RPC** — Helius (mainnet) + public devnet.

## Running locally

```bash
pnpm install
cp .env.example .env       # fill in the values listed below
pnpm --filter @blindsol/api db:migrate
pnpm dev                   # API on :3001, web on :3000
```

### Required env vars

| Var | What it's for |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string. Free DB at neon.tech. |
| `DATABASE_URL_TEST` | Separate Postgres for integration tests. The test runner refuses to start if this equals `DATABASE_URL`. |
| `SOLANA_RPC_URL` | Mainnet RPC (Helius free tier works). Public mainnet-beta is rate-limited and blocks browser origins. |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Same URL, exposed to the browser bundle. |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy app id from dashboard.privy.io — wallet auth. |
| `BADGE_RPC_URL` | Devnet RPC for the Anchor badge program. |
| `BADGE_PROGRAM_ID` | Anchor program id (`Gm6YCGTivfUqtGFoajbdueC3zKSKQM9rXHDNxvP1bJXU` on devnet today). |
| `BADGE_AUTHORITY_KEYPAIR` | Either a path to a Solana keypair JSON or the inline JSON itself (handy for Fly secrets). Authority signs `mint_badge` + `delegate_badge`; needs devnet SOL for tx fees. |
| `BADGE_DELEGATE_TO_PER` | `true` to immediately delegate freshly-minted badges to MagicBlock's PER. Failure logs but doesn't block the claim. |
| `PER_DEV_SECRET` / `PER_ATTESTATION_PUBKEY` | Ed25519 keypair the API uses to sign badge tokens, per-action attestations, and the deterministic anon HMAC. Generate with `pnpm --filter @blindsol/api exec tsx scripts/gen-per-key.ts`. |
| `STAKE_POOL_PUBKEY` | Receive-only pubkey where post fees settle. **Receive-only — never store its secret in env.** Rotate to a multisig before real volume. |
| `STAKE_PER_POST_RAW` | Fee in raw USDC units. `50000` = $0.05. |

`.env.example` ships with comments and the canonical USDC mint (`EPjFWdd5…`).

### Tests

```bash
pnpm --filter @blindsol/api test     # unit + integration against a real Postgres.
```

> Integration tests truncate tables. They refuse to run unless `DATABASE_URL_TEST` is set to a different DB than `DATABASE_URL` — the safety lives in `apps/api/test/_setup/db-isolation.ts`.

### Useful scripts

```
apps/api/scripts/
  gen-per-key.ts          generate a fresh PER ed25519 keypair
  init-registry.ts        initialise the on-chain badge_registry program
  test-delegate.ts        end-to-end smoke: mint a badge + delegate it to PER on devnet
  apply-sql.ts            apply a hand-written .sql file via pg (used for migrations
                          that aren't in the Drizzle journal)
  inspect-data.ts         enumerate usernames + post counts per anon
  rebind-meow.ts          template for rebinding random-seed anons → deterministic anons
  audit-privacy.ts        scan API responses + DB columns for wallet leak surfaces
  purge-test-fixtures.ts  delete leftover test rows
apps/web/scripts/
  build-icons.py          regenerate favicon + apple-icon + public logo from
                          assets/brand/blindSOL.png (auto-crops, exports 512/180)
```

### Building the Anchor program

`anchor build` hits a known toolchain conflict with newer Rust (`proc_macro2::Span::source_file` was removed). Build directly with the SBF toolchain instead — we hand-encode instructions in TS so we don't need the IDL anyway:

```bash
cargo build-sbf --manifest-path programs/badge-registry/Cargo.toml
solana program deploy --program-id target/deploy/badge_registry-keypair.json \
                      --url https://api.devnet.solana.com \
                      target/deploy/badge_registry.so
```

## Architecture notes worth knowing

**Posts are forum-shaped.** The composer collects `title` + `body` separately. Both are stored in dedicated columns; the receipt's `contentHash` is over the canonical `${title}\n${body}` so the receipt still binds the full text. Title is nullable for backwards-compat with rows posted before the dedicated column was added.

**Reactions are polymorphic.** A single `reactions` table covers both post-level and comment-level votes via nullable `post_id` / `comment_id` columns. A CHECK constraint enforces exactly one is set. Two partial unique indexes prevent double-voting per subject.

**Multi-badge purse.** A wallet can hold any number of independent badges. Each badge has its own deterministic anon — `anonId = HMAC(perSecret, wallet || badgeKind)` — so $JUP-you and $BONK-you are distinct, unlinkable handles even though they're the same wallet. The active badge is a UI choice; the API just sees whichever bearer token you send.

**Verify by sender debit, not recipient credit.** Private MagicBlock transfers settle into the PER vault, not the recipient's base-layer ATA. So `verifyOnChain` finds the actual payer from the on-chain TX's pre/post token balances and checks `sha256(payer) == fromWalletHash` AND `debit ≥ expected`.

**Dual RPC.** The API holds two `Connection` objects: `mainnetConnection` for MagicBlock + USDC, `badgeConnection` for the Anchor program on devnet. Don't unify them or the badge program calls will hit the wrong cluster.

**Wallet ↔ identity stays sealed in the rollup.** Even an operator with full server access only ever asks the PER for attestations — the wallet→anon mapping is encrypted state inside the TEE. The deterministic HMAC means the same wallet on a fresh device always reconstructs the same identity, with no need to store anything wallet-related server-side.

**Badge state lives in the rollup, not on Solana.** After `mint_badge`, the Badge account's owner on Solana is flipped from the `badge_registry` program to MagicBlock's Delegation program (`DELeGG…aeSh`). All future state mutations to that account run inside the PER. Anyone can verify the delegation by looking at the Owner field on Solana Explorer.

## Honest limitations

- **Threshold is `> 0`, not a USD floor.** Anyone airdropping you 1 lamport of $JUP makes you eligible for a $JUP badge. Adding price-oracle gating with Pyth is queued but not done.
- **Anonymity stops at the network layer.** IP fingerprinting, stylometry, and timing correlation are on the user / Tor / VPN.
- **24h posting-rights window.** Sign-in re-checks on-chain holdings, but a freshly-issued badge token stays valid for 24h. Sell mid-window and you can still post until the token expires. Shorter TTL is a config flip.
- **Anchor `badge_registry` is on devnet.** Promoting to mainnet is queued. Delegation works the same on either cluster — MagicBlock's Delegation program is deployed on both.
- **Lifecycle features not built yet.** Delegation provides the *foundation* for private revoke/slash/expire flows. Building each of those is normal product work; nothing's wired up beyond mint + delegate today.

## License

MIT.
