"use client";

import { Bell } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAnalyticsOverview } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";

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
export const Header = () => {
  const pathname = usePathname();
  const title = pageTitles[pathname] || "Inspectra AI";
  const { user } = useAuth();
  const { data: analytics } = useAnalyticsOverview();

  const pendingReview = analytics?.pending_review ?? 0;

  return (
    <motion.header
      className="glass sticky top-0 z-10 flex h-16 items-center justify-between border-b px-6"
      initial={{ y: -60 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <div className="flex items-center gap-4">
        <h1 className="text-title font-bold text-primary-text">{title}</h1>
        <nav className="hidden items-center space-x-2 text-sm text-secondary-text md:flex">
          <Link href="/dashboard" className="transition-colors hover:text-primary">
            Home
          </Link>
          <span className="text-border">/</span>
          <span className="text-primary">{title}</span>
        </nav>
      </div>

      <div className="flex items-center gap-3">
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

        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface/50 px-3 py-1.5">
          <div className="text-right">
            <p className="text-xs font-medium text-primary-text">
              {user?.name ?? "Not signed in"}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-secondary-text">
              {user?.role ?? "guest"}
            </p>
          </div>
        </div>
      </div>
    </motion.header>
  );
};
