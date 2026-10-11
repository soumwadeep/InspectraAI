/** @type {import('tailwindcss').Config} */

/**
 * Colours come from CSS variables declared as RGB triples in globals.css, so
 * opacity modifiers (`bg-critical/10`) still resolve. Every pre-existing class
 * name is preserved, which is why the old keys remain alongside the new ones.
 */
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

module.exports = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: v("--color-bg-void"),
        "bg-deep": v("--color-bg-deep"),
        surface: v("--color-surface"),
        "surface-elevated": v("--color-surface-elevated"),
        primary: v("--color-primary"),
        secondary: v("--color-secondary"),
        info: v("--color-info"),
        accent: v("--color-accent"),
        "accent-readable": v("--color-accent-readable"),
        success: v("--color-success"),
        warning: v("--color-warning"),
        critical: v("--color-critical"),
        "critical-text": v("--color-critical-text"),
        "primary-text": v("--color-primary-text"),
        "secondary-text": v("--color-secondary-text"),
        border: v("--color-border"),
        "border-hover": v("--color-border-hover"),
        // `ring` was referenced by button/switch/input/select but never defined,
        // so focus outlines drew nothing.
        ring: v("--color-ring"),
        // Deprecated aliases kept so existing call sites keep compiling; both now
        // resolve to the violet accent rather than introducing a second pink.
        "accent-purple": v("--color-accent"),
        "accent-pink": v("--color-accent"),
        "cyan-glow": v("--color-primary"),
        "purple-glow": v("--color-accent"),
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui"],
        display: ["'Space Grotesk Variable'", "var(--font-geist-sans)", "ui-sans-serif"],
        mono: ["'JetBrains Mono Variable'", "var(--font-geist-mono)", "ui-monospace"],
      },
      fontSize: {
        hero: ["3.5rem", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        display: ["2.25rem", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        title: ["1.375rem", { lineHeight: "1.25", letterSpacing: "-0.01em" }],
        // Small-caps panel labels: a control room needs a label tier more than
        // it needs another large size.
        kicker: [
          "0.6875rem",
          { lineHeight: "1rem", letterSpacing: "0.12em" },
        ],
      },
      backgroundColor: {
        glass: `rgb(var(--color-surface) / var(--surface-alpha))`,
        "glass-hover": "rgb(var(--color-surface-elevated) / 0.8)",
      },
      boxShadow: {
        glass:
          "0 8px 32px 0 rgb(0 0 0 / 0.3), inset 0 1px 0 0 rgb(255 255 255 / 0.05)",
        panel:
          "0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 18px 40px -24px rgb(0 0 0 / 0.8)",
        // Glow strength is a theme variable, so light mode dims instead of
        // leaving a bloom that only makes sense on a dark panel.
        "neon-cyan":
          "0 0 20px rgb(var(--color-primary) / var(--glow-1)), 0 0 44px rgb(var(--color-primary) / var(--glow-2))",
        "neon-purple":
          "0 0 20px rgb(var(--color-accent) / var(--glow-1)), 0 0 44px rgb(var(--color-accent) / var(--glow-2))",
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "pulse-glow": "pulse-glow 2.4s ease-in-out infinite",
        scan: "scan 2s linear infinite",
        shimmer: "shimmer 2.2s ease-in-out infinite",
        "sweep-x": "sweep-x 1.6s cubic-bezier(0.16, 1, 0.3, 1) infinite",
        "reticle-draw": "reticle-draw 0.4s ease-out forwards",
        "boot-line": "boot-line 0.5s ease-out forwards",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": {
            opacity: "1",
            boxShadow: "0 0 18px rgb(var(--color-primary) / var(--glow-1))",
          },
          "50%": {
            opacity: "0.75",
            boxShadow:
              "0 0 28px rgb(var(--color-primary) / var(--glow-2)), 0 0 60px rgb(var(--color-primary) / calc(var(--glow-2) / 2))",
          },
        },
        scan: {
          "0%": { transform: "translateY(-110%)", opacity: "0" },
          "15%": { opacity: "1" },
          "85%": { opacity: "1" },
          "100%": { transform: "translateY(110%)", opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "sweep-x": {
          "0%": { transform: "translateX(-105%)" },
          "100%": { transform: "translateX(105%)" },
        },
        "reticle-draw": {
          from: { strokeDashoffset: "1" },
          to: { strokeDashoffset: "0" },
        },
        "boot-line": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  // tailwindcss-animate was registered but not a single `animate-in`/`animate-out`
  // class was ever used; motion is driven by framer-motion presets instead.
  plugins: [],
};
