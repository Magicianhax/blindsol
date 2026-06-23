import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import "./globals.css";

// Clean sans for the whole UI; a real monospace stays available for hashes,
// anon ids, wallet strings and vote counts via the `numeric` utility.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-real",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BlindSol — anonymous forums for Solana token holders",
  description: "Talk about the tokens you hold without showing your wallet. Settled privately through MagicBlock.",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

// No-flash theme initializer. Runs synchronously at the top of <body> before
// React hydrates, so the saved `data-theme` attribute is applied to <html>
// before any styles resolve. The string is a hardcoded constant — no user
// input is interpolated, so dangerouslySetInnerHTML is safe here.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('blindsol_theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(_){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      data-theme="light"
      suppressHydrationWarning
    >
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
