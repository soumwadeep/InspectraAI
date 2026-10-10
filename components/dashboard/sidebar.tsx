"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Overview,
  LiveInspection,
  UploadAnalyze,
  Equipment,
  History,
  Findings,
  Maintenance,
  AgentActivity,
  Analytics,
  Benchmarks,
  Reports,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "@/components/icons";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "@/lib/theme-provider";

const navItems = [
  { name: "Overview", icon: <Overview className="h-5 w-5" />, href: "/dashboard" },
  { name: "Live Inspection", icon: <LiveInspection className="h-5 w-5" />, href: "/dashboard/inspection/live" },
  { name: "Upload & Analyze", icon: <UploadAnalyze className="h-5 w-5" />, href: "/dashboard/inspection/upload" },
  { name: "Equipment", icon: <Equipment className="h-5 w-5" />, href: "/dashboard/equipment" },
  { name: "Inspection History", icon: <History className="h-5 w-5" />, href: "/dashboard/history" },
  { name: "Findings", icon: <Findings className="h-5 w-5" />, href: "/dashboard/findings" },
  { name: "Maintenance Tickets", icon: <Maintenance className="h-5 w-5" />, href: "/dashboard/tickets" },
  { name: "Agent Activity", icon: <AgentActivity className="h-5 w-5" />, href: "/dashboard/agent" },
  { name: "Analytics", icon: <Analytics className="h-5 w-5" />, href: "/dashboard/analytics" },
  { name: "Benchmarks", icon: <Benchmarks className="h-5 w-5" />, href: "/dashboard/benchmarks" },
  { name: "Reports", icon: <Reports className="h-5 w-5" />, href: "/dashboard/reports" },
  { name: "Settings", icon: <Settings className="h-5 w-5" />, href: "/dashboard/settings" },
];

export const Sidebar = () => {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { theme, toggleTheme } = useTheme();

  return (
    <aside
      className={cn(
        "relative flex h-screen flex-col overflow-y-auto transition-all duration-300",
        collapsed ? "w-16" : "w-64",
        "border-r border-border bg-surface/70 backdrop-blur-xl",
      )}
    >
      <div className="flex h-16 items-center justify-between px-4">
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="flex items-center gap-2"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M2 12l1.5-1.5v9a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-9L22 12 12 3 2 12z" />
                <path d="M7 12v9h10v-9" />
              </svg>
            </span>
            <span className="text-title font-bold text-gradient-hero">
              Inspectra AI
            </span>
          </motion.div>
        )}
        {collapsed && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M2 12l1.5-1.5v9a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-9L22 12 12 3 2 12z" />
            </svg>
          </motion.div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-lg p-1.5 text-secondary-text hover:bg-surface-elevated hover:text-primary"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.name} href={item.href}>
              <motion.div
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-primary shadow-inner shadow-cyan-glow/20"
                    : "text-secondary-text hover:bg-surface-elevated hover:text-primary-text",
                  collapsed && "justify-center",
                )}
                whileHover={{ x: collapsed ? 0 : 4 }}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-indicator"
                    className="absolute inset-0 rounded-lg border border-primary/30"
                    style={{
                      boxShadow: "0 0 15px rgba(56, 189, 248, 0.3)",
                    }}
                  />
                )}
                <span className="relative z-10">{item.icon}</span>
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="relative z-10"
                    >
                      {item.name}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <button
          onClick={() => toggleTheme()}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-secondary-text hover:bg-surface-elevated hover:text-primary",
            collapsed && "justify-center",
          )}
        >
          <motion.div
            animate={{ rotate: theme === "dark" ? 180 : 0 }}
            transition={{ duration: 0.3 }}
          >
            {theme === "dark" ? (
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 3v1m0 16v1m8.66-10H21m-3.34 0Zm-.66 0A8 8 0 1 1 4 12a8 8 0 0 1 13.34-2z" />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
          </motion.div>
        </button>
        <button
          className={cn(
            "mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-secondary-text hover:bg-surface-elevated hover:text-critical",
            collapsed && "justify-center",
          )}
        >
          <LogOut className="h-5 w-5" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
};
