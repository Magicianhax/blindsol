import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-2": "var(--bg-2)",
        paper: "var(--paper)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        "ink-faded": "var(--ink-faded)",
        border: "var(--border)",
        "border-soft": "var(--border-soft)",
        text: "var(--text)",
        "text-2": "var(--text-2)",
        muted: "var(--muted)",
        "muted-2": "var(--muted-2)",
        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        "accent-soft": "var(--accent-soft)",
        success: "var(--success)",
        danger: "var(--danger)",
        warning: "var(--warning)",
        highlighter: "var(--highlighter)",
        "crayon-blue": "var(--crayon-blue)",
        "crayon-red": "var(--crayon-red)",
        "crayon-green": "var(--crayon-green)",
        "crayon-yellow": "var(--crayon-yellow)",
        "crayon-purple": "var(--crayon-purple)",
        "crayon-pink": "var(--crayon-pink)",
        "crayon-orange": "var(--crayon-orange)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Caveat", "Comic Sans MS", "cursive"],
        body: ["var(--font-body)", "Patrick Hand", "Comic Sans MS", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "Menlo", "monospace"],
        sans: ["var(--font-body)", "Patrick Hand", "system-ui", "sans-serif"],
        scribble: ["var(--font-display)", "Caveat", "cursive"],
      },
      boxShadow: {
        pen: "var(--pen-shadow)",
        "pen-sm": "var(--pen-shadow-sm)",
        "pen-lg": "var(--pen-shadow-lg)",
      },
    },
  },
  plugins: [],
};

export default config;
