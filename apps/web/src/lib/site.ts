/**
 * Central site configuration — name, tagline, canonical links, and social
 * handles. Import from here instead of hardcoding URLs across components so
 * branding/links change in one place.
 *
 * NOTE: `social.x` is a placeholder — update it to the real BlindSol handle.
 */
export const SITE = {
  name: "BlindSol",
  tagline: "Anonymous by design, sealed on Solana. Your wallet stays in the enclave.",
  url: "https://blindsol.xyz",
  logo: "/blindSOL.png",
  version: "v0.1 · mainnet beta",
  links: {
    home: "/",
    forum: "/forum",
    about: "/about",
  },
  social: {
    // TODO: replace with the real X handle once it exists.
    x: "https://x.com/blindsol",
    github: "https://github.com/Magicianhax/blindsol",
    docs: "https://docs.magicblock.gg",
  },
} as const;
