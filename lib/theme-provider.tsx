"use client";

import {
  ThemeProvider as NextThemesProvider,
  useTheme as useNextTheme,
} from "next-themes";
import { useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  /** True once the stored theme has been read, so consumers can avoid a flash. */
  resolved: boolean;
}

/**
 * Wraps next-themes but keeps the `{ theme, toggleTheme }` API the sidebar and
 * settings page already use.
 *
 * The previous hand-rolled provider applied the class inside `useEffect`, which
 * always painted the default theme first; next-themes injects a blocking script
 * instead. `enableSystem` is off deliberately: a mission-control demo should not
 * boot into the light palette because the reviewer's OS is in daylight.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

export const useTheme = (): ThemeContextType => {
  const { theme, setTheme, resolvedTheme } = useNextTheme();
  // next-themes reports null until it has read storage on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current: Theme =
    (mounted ? (theme ?? resolvedTheme) : "dark") === "light" ? "light" : "dark";

  return {
    theme: current,
    resolved: mounted,
    toggleTheme: () => setTheme(current === "dark" ? "light" : "dark"),
  };
};
