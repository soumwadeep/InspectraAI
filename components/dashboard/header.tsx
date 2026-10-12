"use client";

import { Bell, Menu } from "@/components/icons";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAnalyticsOverview } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";
import { LanguageSwitcher } from "@/components/dashboard/language-switcher";

const pageTitles: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/inspection/live": "Live Inspection",
  "/dashboard/inspection/upload": "Upload & Analyze",
  "/dashboard/equipment": "Equipment",
  "/dashboard/history": "Inspection History",
  "/dashboard/findings": "Findings",
  "/dashboard/tickets": "Maintenance Tickets",
  "/dashboard/agent": "Agent Activity",
  "/dashboard/analytics": "Analytics",
  "/dashboard/benchmarks": "Benchmarks",
  "/dashboard/reports": "Data export",
  "/dashboard/settings": "Settings",
};

/**
 * Command-style top bar.
 *
 * The search field and notification badge that used to live here were inert:
 * the badge was the literal `3`, and typing in the search box did nothing.
 * Global search returns with the CommandHeader rewrite, wired to a real query.
 */
export const Header = ({ onOpenNav }: { onOpenNav: () => void }) => {
  const pathname = usePathname();
  const title = pageTitles[pathname] || "Inspectra AI";
  const { user } = useAuth();
  const { data: analytics } = useAnalyticsOverview();

  const pendingReview = analytics?.pending_review ?? 0;

  return (
    <motion.header
      className="glass sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b px-4 sm:px-6"
      initial={{ y: -60 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* The sidebar is off-canvas below lg, so this is the only way to reach
            navigation on a phone. */}
        <button
          type="button"
          onClick={onOpenNav}
          className="shrink-0 rounded-lg p-2 text-secondary-text hover:bg-surface-elevated hover:text-primary lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="truncate text-title font-bold text-primary-text">{title}</h1>
        <nav className="hidden shrink-0 items-center space-x-2 text-sm text-secondary-text xl:flex">
          <Link href="/dashboard" className="transition-colors hover:text-primary">
            Home
          </Link>
          <span className="text-border">/</span>
          <span className="text-primary">{title}</span>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <LanguageSwitcher />
        <Link
          href="/dashboard/findings"
          className="relative rounded-lg p-2 text-secondary-text transition-colors hover:bg-surface-elevated hover:text-primary"
          aria-label={
            pendingReview > 0
              ? `${pendingReview} findings awaiting review`
              : "No findings awaiting review"
          }
        >
          <Bell className="h-4 w-4" />
          {pendingReview > 0 && (
            <span className="absolute right-1 top-1 rounded-full bg-critical px-1 text-[10px] font-medium leading-tight text-white tabular-nums">
              {pendingReview > 99 ? "99+" : pendingReview}
            </span>
          )}
        </Link>

        <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface/50 px-2 py-1.5 sm:px-3">
          <div className="min-w-0 text-right">
            <p className="truncate text-xs font-medium text-primary-text">
              {user?.name ?? "Not signed in"}
            </p>
            <p className="truncate text-[10px] uppercase tracking-wide text-secondary-text">
              {user?.role ?? "guest"}
            </p>
          </div>
        </div>
      </div>
    </motion.header>
  );
};
