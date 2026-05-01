import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "BlindSol",
  description: "Anonymous gossip for crypto. Verified holders post anonymously.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="font-sans">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
