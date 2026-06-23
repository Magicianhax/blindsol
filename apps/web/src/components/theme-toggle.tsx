"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "blindsol_theme";

function readSavedTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "light" ? "light" : "dark";
}

/**
 * Two-state theme toggle. Source of truth lives on `<html data-theme="…">`,
 * which is also what the inline no-flash script in `layout.tsx` writes
 * synchronously before hydration. We mirror it into local state so the
 * button icon stays in sync with the current attribute.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(readSavedTheme());
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage can be disabled in some browsers — silently ignore.
    }
  };

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-text-2 transition hover:bg-bg-2 hover:text-text"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5V3M8 13v1.5M14.5 8H13M3 8H1.5M12.6 3.4l-1.06 1.06M4.46 11.54L3.4 12.6M12.6 12.6l-1.06-1.06M4.46 4.46L3.4 3.4" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M13 9.5A5.5 5.5 0 016.5 3 5.5 5.5 0 008 14a5.5 5.5 0 005-4.5z" strokeLinejoin="round" />
    </svg>
  );
}
