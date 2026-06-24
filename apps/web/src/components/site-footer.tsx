import Link from "next/link";
import { Brand } from "./brand";
import { SITE } from "@/lib/site";

/**
 * Shared site footer (editorial theme). Brand + tagline + social, plus columns
 * of product and resource links sourced from lib/site.ts. Used on the landing,
 * forum, and about pages so footers stay consistent in one place.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="in">
        <div className="site-footer__top">
          <div className="site-footer__brand">
            <Brand />
            <p className="site-footer__tag">{SITE.tagline}</p>
            <div className="site-footer__socials">
              <a href={SITE.social.x} target="_blank" rel="noreferrer" aria-label={`${SITE.name} on X`}>
                <XIcon />
              </a>
              <a href={SITE.social.github} target="_blank" rel="noreferrer" aria-label={`${SITE.name} on GitHub`}>
                <GitHubIcon />
              </a>
            </div>
          </div>

          <div className="site-footer__cols">
            <div className="site-footer__col">
              <h4>Product</h4>
              <Link href={SITE.links.forum}>Forum</Link>
              <Link href={SITE.links.about}>About</Link>
            </div>
            <div className="site-footer__col">
              <h4>Resources</h4>
              <a href={SITE.social.github} target="_blank" rel="noreferrer">
                <GitHubIcon /> GitHub
              </a>
              <a href={SITE.social.docs} target="_blank" rel="noreferrer">
                MagicBlock docs ↗
              </a>
              <a href={SITE.social.x} target="_blank" rel="noreferrer">
                <XIcon /> X / Twitter
              </a>
            </div>
          </div>
        </div>

        <div className="site-footer__bottom">
          <span>
            © {year} {SITE.name} · anonymous by design
          </span>
          <span className="sep">{SITE.version}</span>
        </div>
      </div>
    </footer>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.438 9.63 8.205 11.19.6.11.82-.26.82-.57 0-.28-.01-1.02-.015-2.01-3.338.71-4.042-1.59-4.042-1.59-.546-1.36-1.332-1.72-1.332-1.72-1.09-.73.082-.72.082-.72 1.205.08 1.84 1.22 1.84 1.22 1.07 1.8 2.807 1.28 3.492.98.108-.76.42-1.28.762-1.57-2.665-.3-5.466-1.31-5.466-5.83 0-1.29.465-2.34 1.235-3.17-.135-.3-.54-1.52.105-3.17 0 0 1.005-.32 3.3 1.21a11.5 11.5 0 0 1 3-.4c1.02 0 2.04.135 3 .4 2.28-1.53 3.285-1.21 3.285-1.21.645 1.65.24 2.87.12 3.17.765.83 1.23 1.88 1.23 3.17 0 4.53-2.805 5.52-5.475 5.82.42.36.81 1.09.81 2.2 0 1.59-.015 2.87-.015 3.26 0 .31.21.69.825.57C20.565 21.92 24 17.5 24 12.29 24 5.78 18.627.5 12 .5Z" />
    </svg>
  );
}
