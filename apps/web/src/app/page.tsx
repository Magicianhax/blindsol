import type { CSSProperties } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { Seal } from "@/components/seal";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { TokenIcon } from "@/components/token-icon";
import styles from "./page.module.css";

/**
 * BlindSol marketing landing page (route: /), ported from the "BlindSol Home"
 * design. The forum lives at /forum. Styles are scoped in page.module.css; the
 * theme tokens come from globals.css. The live-feed "peek" rows are illustrative
 * sample content, matching the design.
 */

type PeekRow = {
  votes: number;
  title: string;
  by: string;
  token: {
    sym: string;
    coin: string;
    kind?: string;
    color?: string;
    commons?: boolean;
    locked?: boolean;
  };
  age: string;
  comments: string;
};

const PEEK_STAGGER_BASE = 120;
const PEEK_STAGGER_STEP = 110;

const PEEK: PeekRow[] = [
  {
    votes: 412,
    title: "Is restaking just a yield trap with extra steps?",
    by: "7c2f…9e21",
    token: { sym: "$SOL", coin: "SO", color: "#14C98E" },
    age: "23m",
    comments: "88 comments",
  },
  {
    votes: 938,
    title: 'Unpopular: most "communities" are just exit liquidity with a Discord',
    by: "de01…607a",
    token: { sym: "Commons", coin: "⌂", commons: true },
    age: "3h",
    comments: "301 comments",
  },
  {
    votes: 207,
    title: "Show me your dirtiest production Rust and I'll review it, anon",
    by: "a91c…f318",
    token: { sym: "$JUP", coin: "JU", kind: "jup_holder", color: "#7BC242" },
    age: "1h",
    comments: "140 comments",
  },
  {
    votes: 333,
    title: "Memecoin liquidity is a confidence game and that's fine, actually",
    by: "e7c1…90ab",
    token: { sym: "$BONK", coin: "BO", kind: "bonk_holder", color: "#F2A900", locked: true },
    age: "4h",
    comments: "gated room",
  },
];

export default function LandingPage() {
  return (
    <>
      <header className={styles.top}>
        <div className={styles.inner}>
          <Brand href="/" />
          <nav className={styles.nlinks}>
            <Link href="/forum">Forum</Link>
            <a href="#how">How it works</a>
            <a href="#why">Why</a>
          </nav>
          <div className={styles.spacer} />
          <ThemeToggle />
          <Link href="/forum" className={styles.enter}>
            Enter the forum →
          </Link>
        </div>
      </header>

      {/* hero */}
      <section className={styles.hero}>
        <div className={styles.wrap}>
          <div className={styles.grid}>
            <div>
              <span className={styles.tagline}>
                <span className={styles.pip} />v0.9 · BETA — anonymous by design
              </span>
              <h1>
                Talk freely.
                <br />
                <span className={styles.i}>Stay unseen.</span>
              </h1>
              <p className={styles.lead}>
                The anonymous forum for Solana. Your wallet becomes a <b>seal</b> — provable,
                pseudonymous, ungoogleable. Argue, ship and shitpost without ever showing your face.
              </p>
              <div className={styles.cta}>
                <Link href="/forum" className={`${styles.btn} ${styles.solid}`}>
                  Enter the forum →
                </Link>
                <a href="#how" className={styles.btn}>
                  How sealing works
                </a>
              </div>
              <div className={styles.stats}>
                <div>
                  <div className={styles.n}>41,208</div>
                  <div className={styles.l}>sealed anons</div>
                </div>
                <div>
                  <div className={styles.n}>2,914</div>
                  <div className={styles.l}>posts / day</div>
                </div>
                <div>
                  <div className={styles.n}>17</div>
                  <div className={styles.l}>gated rooms</div>
                </div>
              </div>
            </div>
            <div className={styles.sealcol}>
              <span className={styles.seal}>
                <Seal hash="7f3a9c2e1b8d4f6005a1c9" size={168} />
              </span>
              <div className={styles.cap}>
                your wallet · <b>sealed</b>
                <br />
                anon id <b>7f3a…a1c9</b>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* live feed peek */}
      <section className={styles.peek}>
        <div className={styles.wrap}>
          <div className={styles.rule}>Loud in the rooms right now</div>
          <ol className={styles.peeklist}>
            {PEEK.map((r, i) => (
              <li
                key={i}
                className={`${styles.pr} ${styles.show}`}
                style={{ animationDelay: `${PEEK_STAGGER_BASE + i * PEEK_STAGGER_STEP}ms` }}
              >
                <div className={styles.v}>
                  <span className={styles.tri}>▲</span>
                  {r.votes}
                </div>
                <div>
                  <Link className={styles.ti} href="/forum">
                    {r.title}
                  </Link>
                  <div className={styles.m}>
                    <span className={styles.by}>{r.by}</span> ·{" "}
                    <span
                      className={styles.tok}
                      style={r.token.color ? ({ "--tc": r.token.color } as CSSProperties) : undefined}
                    >
                      {r.token.kind ? (
                        <TokenIcon kind={r.token.kind} size={15} />
                      ) : (
                        <span
                          className={`${styles.coin}${r.token.commons ? " " + styles.commons : ""}`}
                        >
                          {r.token.coin}
                        </span>
                      )}
                      {r.token.sym}
                      {r.token.locked && <span className={styles.lk}>🔒</span>}
                    </span>{" "}
                    · {r.age}
                  </div>
                </div>
                <div className={styles.c}>{r.comments}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* how it works */}
      <section className={styles.sec} id="how">
        <div className={styles.wrap}>
          <div className={styles.rule}>Three steps</div>
          <h2>From wallet to seal in seconds.</h2>
          <p className={styles.sub}>
            Sign once. Get a sigil. Walk into every room you qualify for — your face never enters
            the building.
          </p>
          <div className={styles.steps}>
            <div className={styles.step}>
              <div className={styles.k}>01</div>
              <h3>Connect &amp; sign</h3>
              <p>
                Sign a message — no transaction, no gas. We never touch your funds and never see
                your keys.
              </p>
            </div>
            <div className={styles.step}>
              <div className={styles.k}>02</div>
              <h3>Get your seal</h3>
              <p>
                Your address is hashed into a unique sigil and a short anon id like{" "}
                <code>7f3a…a1c9</code>. That&apos;s your whole identity here.
              </p>
            </div>
            <div className={styles.step}>
              <div className={styles.k}>03</div>
              <h3>Walk in</h3>
              <p>
                Rooms you qualify for light up automatically. Post, vote, reply. Leave and the seal
                stays — your face never does.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* why */}
      <section className={styles.sec} id="why">
        <div className={styles.wrap}>
          <div className={styles.why}>
            <div>
              <div className={styles.rule}>Why BlindSol</div>
              <h2>A forum that can&apos;t dox you, sell you, or rank you.</h2>
              <p className={styles.sub}>
                No real names. No engagement algorithm. No data broker on the other side of the
                screen. Just wallets, seals, and conversation.
              </p>
            </div>
            <ul className={styles.lines}>
              <li>
                <span className={styles.x}>01</span>
                <div>
                  <b>Sealed identity</b>
                  <p>
                    One-of-one seal minted from your wallet hash. Stable enough for reputation,
                    blind enough to stay untraceable.
                  </p>
                </div>
              </li>
              <li>
                <span className={styles.x}>02</span>
                <div>
                  <b>Token-gated rooms</b>
                  <p>
                    Hold the bag, get the room — proven by signature, never by handing over your
                    keys or identity.
                  </p>
                </div>
              </li>
              <li>
                <span className={styles.x}>03</span>
                <div>
                  <b>Signal, not feed</b>
                  <p>
                    Chronological and vote-sorted. The room decides what rises, in the open, one
                    upvote at a time.
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* cta band */}
      <section className={styles.band}>
        <div className={styles.wrap}>
          <h2>
            Say something
            <br />
            <span className={styles.i}>worth reading.</span>
          </h2>
          <p>
            Get your seal, find a room, start a thread. The good arguments are already happening.
          </p>
          <Link href="/forum" className={`${styles.btn} ${styles.solid}`}>
            Enter the forum →
          </Link>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
