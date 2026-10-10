"use client";

import { Bell, Search, User } from "lucide-react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";

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
  "/dashboard/reports": "Reports",
  "/dashboard/settings": "Settings",
};

export const Header = () => {
  const pathname = usePathname();
  const title = pageTitles[pathname] || "Inspectra AI";

  return (
    <motion.header
      className="glass sticky top-0 z-10 flex h-16 items-center justify-between border-b px-6"
      initial={{ y: -60 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <div className="flex items-center gap-4">
        <h1 className="text-title font-bold text-primary-text">{title}</h1>
        <div className="hidden md:block">
          <nav className="flex items-center space-x-2 text-sm text-secondary-text">
            <Link
              href="/dashboard"
              className="hover:text-primary transition-colors"
            >
              Home
            </Link>
            <span className="text-border">/</span>
            <span className="text-primary">{title}</span>
          </nav>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-text" />
          <input
            type="text"
            placeholder="Search..."
            className="h-9 w-64 rounded-lg border border-border bg-surface/50 pl-10 pr-3 text-sm text-primary-text placeholder:text-secondary-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative rounded-lg p-2 text-secondary-text hover:bg-surface-elevated hover:text-primary focus:outline-none"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-critical text-[10px] text-white">
            3
          </span>
        </motion.button>

        <div className="h-8 w-8 rounded-full bg-primary/20 ring-2 ring-primary/30 flex items-center justify-center overflow-hidden">
          <User className="h-5 w-5 text-primary" />
        </div>
      </div>
    </motion.header>
  );
};
