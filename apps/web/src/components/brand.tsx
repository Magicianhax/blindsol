import Link from "next/link";
import { SITE } from "@/lib/site";

/**
 * The BlindSol wordmark: the logo doodle + "BlindSol" (serif) + a small mono
 * "sealed" tag. Always links to the landing page ("/"). Used in the top nav,
 * the landing header, and the footer.
 */
export function Brand({ href = SITE.links.home }: { href?: string }) {
  return (
    <Link href={href} className="brand" aria-label={`${SITE.name} — home`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={SITE.logo} alt="" className="brand-logo" draggable={false} aria-hidden />
      BlindSol<span className="b">sealed</span>
    </Link>
  );
}
