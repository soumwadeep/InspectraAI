/** @type {import('tailwindcss').Config} */
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
        background: "#080D16",
        surface: "#111827",
        "surface-elevated": "#172235",
        primary: "#38BDF8",
        secondary: "#22D3EE",
        success: "#10B981",
        warning: "#F59E0B",
        critical: "#EF4444",
        "primary-text": "#F8FAFC",
        "secondary-text": "#94A3B8",
        border: "#263448",
        "border-hover": "#364558",
        "accent-purple": "#A78BFA",
        "accent-pink": "#EC4899",
        "cyan-glow": "rgba(56, 189, 248, 0.3)",
        "purple-glow": "rgba(167, 139, 250, 0.3)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "system-ui"],
        mono: ["var(--font-geist-mono)", "Fira Code", "monospace"],
      },
      fontSize: {
        "hero": ["3.5rem", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "display": ["2.5rem", { lineHeight: "1.1", letterSpacing: "-0.01em" }],
        "title": ["1.5rem", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
      },
      backgroundColor: {
        "glass": "rgba(8, 13, 22, 0.7)",
        "glass-hover": "rgba(17, 24, 39, 0.8)",
      },
      boxShadow: {
        "glass": "0 8px 32px 0 rgba(0, 0, 0, 0.3), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)",
        "neon-cyan": "0 0 20px rgba(56, 189, 248, 0.4), 0 0 40px rgba(56, 189, 248, 0.2)",
        "neon-purple": "0 0 20px rgba(167, 139, 250, 0.4), 0 0 40px rgba(167, 139, 250, 0.2)",
        "inner-glow": "inset 0 0 10px rgba(56, 189, 248, 0.2)",
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "scan": "scan 2s linear infinite",
        "float": "float 6s ease-in-out infinite",
        "shimmer": "shimmer 3s infinite",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: 1, boxShadow: "0 0 20px rgba(56, 189, 248, 0.4)" },
          "50%": { opacity: 0.8, boxShadow: "0 0 30px rgba(56, 189, 248, 0.6), 0 0 60px rgba(56, 189, 248, 0.3)" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};