"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle({ className = "" }) {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme || "light");
  }, []);

  function toggleTheme() {
    const current = document.documentElement.dataset.theme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("mfp-theme", next); } catch {}
    setTheme(next);
  }

  return (
    <button data-testid="theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"} className={`inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-surface px-3 text-xs font-medium text-ink-muted hover:border-line-strong hover:text-ink ${className}`}>
      <span aria-hidden="true">{theme === "dark" ? "☀" : "◐"}</span>
      <span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
