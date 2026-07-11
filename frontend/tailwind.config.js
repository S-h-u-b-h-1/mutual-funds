/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--color-canvas) / <alpha-value>)",
        ink: {
          DEFAULT: "rgb(var(--color-text) / <alpha-value>)",
          muted: "rgb(var(--color-text-muted) / <alpha-value>)",
          faint: "rgb(var(--color-text-faint) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--color-brand) / <alpha-value>)",
          soft: "rgb(var(--color-brand-hover) / <alpha-value>)",
        },
        pos: "rgb(var(--color-positive) / <alpha-value>)",
        neg: "rgb(var(--color-negative) / <alpha-value>)",
        warn: "rgb(var(--color-warning) / <alpha-value>)",
        info: "rgb(var(--color-information) / <alpha-value>)",
        confidence: "rgb(var(--color-confidence) / <alpha-value>)",
        missing: "rgb(var(--color-missing) / <alpha-value>)",
        line: "rgb(var(--color-border) / <alpha-value>)",
        "line-strong": "rgb(var(--color-border-strong) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--color-surface-raised) / <alpha-value>)",
        "surface-strong": "rgb(var(--color-surface-strong) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-research-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-research-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: { glass: "var(--shadow-surface)", glow: "0 0 0 1px rgb(var(--color-brand) / 0.22), 0 14px 36px rgb(var(--color-brand) / 0.14)", float: "var(--shadow-float)" },
      letterSpacing: { tightest: "-0.04em" },
      keyframes: { "fade-up": { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } }, shimmer: { "100%": { transform: "translateX(100%)" } } },
      animation: { "fade-up": "fade-up var(--duration-slow) var(--ease-research) both" },
    },
  },
  plugins: [],
};
