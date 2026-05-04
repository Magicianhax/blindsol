import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-2": "var(--bg-2)",
        "bg-3": "var(--bg-3)",
        "bg-4": "var(--bg-4)",
        paper: "var(--paper)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        "ink-faded": "var(--ink-faded)",
        line: "var(--line)",
        "line-2": "var(--line-2)",
        border: "var(--border)",
        "border-soft": "var(--border-soft)",
        text: "var(--text)",
        "text-2": "var(--text-2)",
        muted: "var(--muted)",
        "muted-2": "var(--muted-2)",
        "fg-3": "var(--fg-3)",

        acid: "var(--acid)",
        "acid-d": "var(--acid-d)",
        "acid-soft": "var(--acid-soft)",
        "acid-line": "var(--acid-line)",

        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        "accent-soft": "var(--accent-soft)",
        success: "var(--success)",
        danger: "var(--danger)",
        warning: "var(--warning)",
        warn: "var(--warn)",
        highlighter: "var(--highlighter)",

        // Legacy crayon-* tokens — aliased to the dark palette so existing
        // className references render naturally on the new aesthetic.
        "crayon-blue": "var(--crayon-blue)",
        "crayon-red": "var(--crayon-red)",
        "crayon-green": "var(--crayon-green)",
        "crayon-yellow": "var(--crayon-yellow)",
        "crayon-purple": "var(--crayon-purple)",
        "crayon-pink": "var(--crayon-pink)",
        "crayon-orange": "var(--crayon-orange)",
      },
      fontFamily: {
        display: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
        body: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
        sans: ["var(--font-sans)", "Space Grotesk", "system-ui", "sans-serif"],
        scribble: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      boxShadow: {
        pen: "var(--pen-shadow)",
        "pen-sm": "var(--pen-shadow-sm)",
        "pen-lg": "var(--pen-shadow-lg)",
        "acid-soft": "0 0 0 1px var(--acid-line)",
      },
    },
  },
  plugins: [],
};

export default config;
