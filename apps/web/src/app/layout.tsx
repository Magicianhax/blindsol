import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { SITE } from "@/lib/site";
import "./globals.css";

// The editorial theme uses only system font stacks (Georgia serif / system
// sans / monospace), declared as CSS variables in globals.css — so there are
// no web fonts to load here.

const TITLE = "BlindSol — talk freely, stay unseen";
const DESCRIPTION =
  "The anonymous forum for Solana. Prove you hold the token to post, but never show which wallet — verified and anonymous at once.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: SITE.name,
  icons: {
    icon: SITE.logo,
    apple: SITE.logo,
  },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: TITLE,
    description: DESCRIPTION,
    url: SITE.url,
    images: [{ url: SITE.logo, alt: SITE.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [SITE.logo],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#15140f" },
  ],
};

// No-flash theme initializer. Runs synchronously at the top of <body> before
// React hydrates, so the saved `data-theme` attribute is applied to <html>
// before any styles resolve. The string is a hardcoded constant — no user
// input is interpolated, so dangerouslySetInnerHTML is safe here.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('blindsol_theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(_){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <Providers>
          {children}
          <MobileTabBar />
        </Providers>
      </body>
    </html>
  );
}
