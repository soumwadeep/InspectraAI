"use client";

import { ThemeProvider } from "@/lib/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { useState } from "react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: 1,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          {/*
            `reducedMotion="user"` neutralises transform/opacity animations for
            visitors who ask for less motion. It does *not* stop useSpring or
            useTransform numeric animation, so components driving numbers or
            parallax check useReducedMotion() themselves — see lib/motion.
          */}
          <MotionConfig reducedMotion="user">
            {children}
            <Toaster closeButton position="top-right" richColors />
          </MotionConfig>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
