"use client";

import Link from "next/link";
import { TopNav } from "@/components/top-nav";

export default function AboutPage() {
  return (
    <>
      <TopNav active="about" />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <header className="mb-6 sm:mb-8">
          <h1 className="font-display text-4xl leading-tight text-ink sm:text-6xl md:text-7xl">
            <span className="scribble-underline">about BlindSol</span>
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-text-2 sm:mt-4 sm:text-[17px]">
            A tiny anonymous forum where verified token holders talk about the bags they hold.
            Built for Colosseum&apos;s MagicBlock Privacy Track.
          </p>
        </header>

        {/* What is this */}
        <Section title="what is this" tape>
          <p>
            BlindSol is a forum that does one weird trick: you have to prove you hold a token to
            post about it, but nobody ever sees which wallet you used. Think Reddit or Hacker News,
            except every poster carries a verifiable badge — <span className="highlighter">$JUP</span>{" "}
            holder, <span className="highlighter">$BONK</span> holder, <span className="highlighter">$PYTH</span>{" "}
            holder — and those badges are mathematically real, not self-claimed.
          </p>
          <p className="mt-3">
            The trade-off most crypto social apps make is: <em>verified or anonymous, pick one.</em>{" "}
            BlindSol picks both.
          </p>
        </Section>

        {/* Why we built it */}
        <Section title="why we built it" tape={false}>
          <p>
            Crypto Twitter is loud and unverified. Anyone can shill any bag without proof they
            actually hold it. People who do hold real positions self-censor — because a wallet
            address on the timeline becomes a wallet address on a target list. Front-runners,
            chain-watchers, exes, employers, regulators — once you&apos;re labelled, you&apos;re
            labelled forever.
          </p>
          <p className="mt-3">
            We wanted a place where you can say <span className="highlighter">&ldquo;I&apos;m long{" "}
            $JUP and the v2 launch is undercooked&rdquo;</span> and have the audience know you&apos;re
            telling on yourself <em>and</em> not have your portfolio scraped by Monday.
          </p>
        </Section>

        {/* How it works */}
        <Section title="how it works" tape>
          <ol className="space-y-4">
            <ListStep n="1" label="connect wallet">
              Phantom, Solflare, Backpack, or Jupiter Wallet. Read-only at this point — we just
              need a pubkey to send a challenge to.
            </ListStep>
            <ListStep n="2" label="sign a challenge to claim a badge">
              Pick a community whose token you hold. Sign a one-time message proving you control
              that wallet. The signature goes to MagicBlock&apos;s TEE.
            </ListStep>
            <ListStep n="3" label="TEE verifies you hold, issues an anon handle">
              Inside the trusted enclave, the server checks the on-chain balance, derives an
              anonymous handle as <span className="font-mono">HMAC(perSecret, wallet || kind)</span>,
              mints an on-chain Badge account, and signs a session token. The wallet ↔ handle link{" "}
              <em>never leaves the enclave.</em>
            </ListStep>
            <ListStep n="4" label="badge state delegated to MagicBlock PER">
              Immediately after mint, the Badge account&apos;s ownership on Solana is handed over
              to MagicBlock&apos;s Delegation program. Future lifecycle changes (revoke, slash,
              expire) run privately at sub-50ms inside the rollup&apos;s TEE — Solana never sees the
              intermediate state.
            </ListStep>
            <ListStep n="5" label="post — verified, anonymous, settled">
              Your post appears under your token badge and the anonymous handle. Readers know
              you hold the bag — they just don&apos;t know who you are.
            </ListStep>
            <ListStep n="6" label="sign in from any device, no account needed">
              The handle derivation is deterministic, so the same wallet on any browser /
              phone reconstructs the same identity. Signing a fresh challenge restores all your
              badges — no localStorage, no email, no password. The server still re-checks
              on-chain holdings, so if you sold the bag your posting rights end.
            </ListStep>
          </ol>
        </Section>

        {/* MagicBlock's role */}
        <Section title="what MagicBlock does for us" tape={false}>
          <p>MagicBlock&apos;s rollup is the privacy engine. Three pieces matter:</p>
          <ul className="mt-3 space-y-3">
            <BulletItem label="1) Private Ephemeral Rollup (PER) for identity derivation">
              A TEE-backed rollup where state is encrypted and computation is attested. We use it
              to (a) verify token holdings off-chain, (b) derive your anonymous identity from the
              wallet, and (c) sign session tokens & per-action attestations. The encrypted-state
              property means even an operator with full server access can&apos;t map wallets to
              handles.
            </BulletItem>
            <BulletItem label="2) State delegation for badge lifecycle">
              When a Badge account is created on Solana, we immediately delegate it to the rollup.
              Solana itself updates the badge&apos;s on-chain owner field to MagicBlock&apos;s
              Delegation program — anyone can verify it on Solana Explorer. From that moment all
              future mutations to that badge run inside the PER&apos;s encrypted TEE state, at
              sub-50ms latency. Revoke, slash, expire — none of those will ever appear as public
              transactions on the L1 ledger.
            </BulletItem>
            <BulletItem label="3) Attestation primitives">
              Every action you take (post, comment, vote) gets an ed25519 signature from the PER
              key. We store that signature with the row so any future reader can prove
              cryptographically that the action came from a verified badge — even after the
              content is deleted.
            </BulletItem>
          </ul>
        </Section>

        {/* Anonymity model */}
        <Section title="how the anonymity actually works" tape>
          <p>
            The interesting bit is the identity derivation. We compute:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg border-2 border-ink bg-paper p-4 font-mono text-sm leading-relaxed text-ink">
{`anonSeed = HMAC-SHA256(perSecret, wallet || badgeKind)
anonId   = base32(anonSeed)[:12]`}
          </pre>
          <p className="mt-3">
            Two properties fall out:
          </p>
          <ul className="mt-2 space-y-2">
            <BulletPoint>
              <span className="font-display text-lg text-ink">stable</span> — the same wallet
              claiming the same badge always gets the same anon handle, so people can build
              reputation across threads.
            </BulletPoint>
            <BulletPoint>
              <span className="font-display text-lg text-ink">unlinkable</span> — without{" "}
              <code className="font-mono text-sm">perSecret</code> (which lives only inside the
              TEE), nobody can go from <code className="font-mono text-sm">anonId</code> back to
              the wallet. Not us. Not a database leak. Not a subpoena to our cloud provider.
            </BulletPoint>
            <BulletPoint>
              <span className="font-display text-lg text-ink">per-bag distinct</span> — if you
              hold both $JUP and $BONK and claim both badges, you get two different anons. Don&apos;t
              try to link them in posts and you stay separated.
            </BulletPoint>
          </ul>
        </Section>

        {/* What's stored where */}
        <Section title="what we store, where" tape={false}>
          <ul className="space-y-3">
            <BulletPoint>
              <strong className="font-display text-lg">Postgres (Neon):</strong> posts, comments,
              reactions, audit events. Every row uses <code className="font-mono text-sm">anon_id</code>{" "}
              — <em>never</em> a wallet address. If our DB leaked tomorrow, it would expose anon
              handles and post content; not who anyone is.
            </BulletPoint>
            <BulletPoint>
              <strong className="font-display text-lg">MagicBlock PER:</strong> the
              wallet ↔ anon mapping, the token-balance proofs, the attestation private key. This
              is the only place that knows which wallet is which anon, and even our own server
              can&apos;t read it directly — it can only request attestations.
            </BulletPoint>
            <BulletPoint>
              <strong className="font-display text-lg">Anchor badge registry (devnet today):</strong>{" "}
              an on-chain registry of badge mints, so anyone can audit how many badges have been
              issued. Each row stores <code className="font-mono text-sm">(kind, sha256(anonSeed),
              index, ts)</code> — never the issuer wallet. After mint, ownership of the Badge
              account is handed to MagicBlock&apos;s Delegation program; further mutations happen
              inside the rollup.
            </BulletPoint>
          </ul>
        </Section>

        {/* Honest limitations */}
        <Section title="what is NOT protected (being honest)" tape>
          <p>
            Privacy is a stack. We handle the on-chain and database layers; the rest is on you:
          </p>
          <ul className="mt-3 space-y-2">
            <BulletPoint>
              <span className="font-display text-lg">network metadata.</span> If you connect from
              the same IP every time, that&apos;s a fingerprint. Use a VPN / Tor if you care.
            </BulletPoint>
            <BulletPoint>
              <span className="font-display text-lg">writing style.</span> Stylometry / LLM
              fingerprinting can correlate posts across handles. Anonymity covers metadata, not
              language patterns.
            </BulletPoint>
            <BulletPoint>
              <span className="font-display text-lg">timing.</span> If you post the same minute
              you tweet from your public account, that&apos;s a correlation. Be patient.
            </BulletPoint>
            <BulletPoint>
              <span className="font-display text-lg">your own posts.</span> Don&apos;t post your
              wallet address. Don&apos;t post a screenshot with your address visible. We can&apos;t
              save you from you.
            </BulletPoint>
          </ul>
        </Section>

        {/* Tech stack */}
        <Section title="the stack" tape={false}>
          <div className="grid gap-3 sm:grid-cols-2">
            <StackCard label="Frontend" items={["Next.js 15 (App Router)", "Tailwind CSS", "Solana Wallet Adapter", "Patrick Hand + Caveat fonts"]} />
            <StackCard label="Backend" items={["Express", "Drizzle ORM", "Neon Postgres", "ed25519 attestations"]} />
            <StackCard label="Privacy" items={["MagicBlock Private Ephemeral Rollup", "MagicBlock Private Payments", "TEE-attested badge issuance", "HMAC-derived anon IDs"]} />
            <StackCard label="On-chain" items={["Solana mainnet", "Anchor badge_registry program", "Helius RPC", "Phantom wallet"]} />
          </div>
        </Section>

        {/* Links */}
        <Section title="links" tape>
          <ul className="space-y-2">
            <LinkRow href="https://docs.magicblock.gg" label="MagicBlock docs ↗" />
            <LinkRow href="https://www.colosseum.org" label="Colosseum (the hackathon) ↗" />
            <LinkRow href="https://book.anchor-lang.com" label="Anchor framework ↗" />
            <LinkRow href="https://orm.drizzle.team" label="Drizzle ORM ↗" />
            <LinkRow href="https://neon.tech" label="Neon Postgres ↗" />
          </ul>
        </Section>

        <div className="mt-10 flex justify-center">
          <Link href="/" className="scribble-btn scribble-btn--primary">
            ← back to threads
          </Link>
        </div>

        <footer className="mt-10 border-t-2 border-dashed border-border-soft pt-4 text-[13px] text-muted">
          <p>
            BlindSol v0.1 · mainnet beta. built clumsily and lovingly for the MagicBlock Privacy
            Track. if you&apos;re reading this you&apos;re the kind of nerd we built it for.
          </p>
        </footer>
      </main>
    </>
  );
}

// ─── building blocks ──────────────────────────────────────────────────

function Section({
  title,
  children,
  tape,
}: {
  title: string;
  children: React.ReactNode;
  tape: boolean;
}) {
  return (
    <section className="mb-6 sm:mb-8">
      <h2 className="mb-3 font-display text-2xl leading-tight text-ink sm:text-3xl md:text-4xl">
        <span className="scribble-underline">{title}</span>
      </h2>
      <div
        className={`scribble-card ${tape ? "tape-card" : ""} px-4 py-4 text-[14px] leading-relaxed text-text-2 sm:px-5 sm:py-5 sm:text-[15px]`}
      >
        {children}
      </div>
    </section>
  );
}

function ListStep({ n, label, children }: { n: string; label: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-crayon-yellow font-display text-xl leading-none shadow-pen-sm">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-xl leading-tight text-ink">{label}</div>
        <p className="mt-1 leading-snug">{children}</p>
      </div>
    </li>
  );
}

function BulletItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li>
      <div className="font-display text-xl leading-tight text-ink">{label}</div>
      <p className="mt-1 leading-snug">{children}</p>
    </li>
  );
}

function BulletPoint({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="select-none text-ink">→</span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

function StackCard({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="scribble-card-flat p-3">
      <div className="font-display text-xl leading-none text-ink">{label}</div>
      <ul className="mt-2 space-y-1 text-sm text-text-2">
        {items.map((it) => (
          <li key={it} className="flex gap-2">
            <span className="select-none text-muted-2">·</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LinkRow({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-block rounded px-1 font-display text-lg text-ink transition hover:bg-crayon-yellow"
      >
        {label}
      </a>
    </li>
  );
}
