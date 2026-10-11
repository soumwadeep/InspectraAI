import { useEffect, useState } from "react";

/**
 * Palette shared by every chart, matching the design tokens in globals.css.
 * Charts previously hardcoded the old sky/cyan palette (#38BDF8, #EC4899), so a
 * theme switch left graphs coloured from a different design system than the page.
 */
export const chartPalette = {
  primary: "#00D9FF",
  secondary: "#5B8CFF",
  accent: "#8B5CF6",
  accentReadable: "#A78BFA",
  success: "#00E5A8",
  warning: "#FFB547",
  critical: "#FF5263",
  muted: "#8496B3",
} as const;

export const chartSeriesColors = [
  chartPalette.primary,
  chartPalette.secondary,
  chartPalette.accentReadable,
  chartPalette.success,
  chartPalette.warning,
  chartPalette.critical,
];

/**
 * recharts `<ResponsiveContainer>` measures the DOM on mount, so the server
 * renders width 0 while the client renders the real width — a guaranteed
 * hydration mismatch. Charts wait for the first client measurement and show a
 * skeleton instead, which is also the honest thing to display with no data yet.
 */
export function useIsMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export const tooltipStyle = {
  backgroundColor: "rgb(var(--color-surface) / 0.96)",
  border: "1px solid rgb(var(--color-border))",
  borderRadius: "0.5rem",
  boxShadow: "0 18px 40px -24px rgb(0 0 0 / 0.8)",
} as const;

export const tooltipItemStyle = {
  color: "rgb(var(--color-primary-text))",
  fontSize: "12px",
} as const;

export const tooltipLabelStyle = {
  color: "rgb(var(--color-secondary-text))",
  fontSize: "11px",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
} as const;

export const axisTick = {
  fill: "rgb(var(--color-secondary-text))",
  fontSize: 11,
} as const;

export const gridStroke = "rgb(var(--color-border) / 0.6)";
