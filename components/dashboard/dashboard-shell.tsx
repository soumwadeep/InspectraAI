"use client";

/**
 * Dashboard chrome: navigation, header and the route guard.
 *
 * The guard lives here rather than in each page because every page under
 * `/dashboard` needs it, and `useRequireAuth` — which already existed — had no
 * caller anywhere, so a signed-out visitor who typed the URL got the full shell
 * with "Not signed in" in the corner and 401s behind it.
 *
 * Nothing renders while the session is being resolved. Showing the shell first
 * and redirecting after leaks the navigation and fires the data queries for a
 * visitor who is about to be sent to /login.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { RouteTransition } from "@/components/motion/route-transition";
import { OfflineBanner } from "@/components/system/offline-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { useRequireAuth } from "@/lib/auth-context";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireAuth();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // A drawer left open across a navigation would sit over the new page.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="w-full max-w-md space-y-3 px-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-background">
      {/* Instrument grid behind everything; hidden entirely under reduced motion
          by the rule in globals.css, so it is ambience and never a distraction. */}
      <div aria-hidden className="grid-overlay pointer-events-none absolute inset-0" />

      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onOpenNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6">
            <OfflineBanner />
            <RouteTransition>{children}</RouteTransition>
          </div>
        </main>
      </div>
    </div>
  );
}
