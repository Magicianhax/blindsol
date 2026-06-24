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
        "accent-line": "var(--accent-line)",
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
        // Editorial type system — system stacks, no web fonts. Serif for
        // headings/prose, sans for UI chrome, monospace for meta/labels.
        sans: ["var(--sans)"],
        body: ["var(--sans)"],
        scribble: ["var(--sans)"],
        serif: ["var(--serif)"],
        display: ["var(--serif)"],
        mono: ["var(--mono)"],
        numeric: ["var(--mono)"],
        "mono-real": ["var(--mono)"],
      },
      boxShadow: {
        pen: "var(--pen-shadow)",
        "pen-sm": "var(--pen-shadow-sm)",
        "pen-lg": "var(--pen-shadow-lg)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        "focus-ring": "0 0 0 3px var(--acid-soft)",
        "acid-soft": "0 0 0 1px var(--acid-line)",
      },
    },
  },
  plugins: [],
};

export default config;
