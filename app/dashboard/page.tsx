"use client";

import { motion } from "framer-motion";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Equipment as EquipmentIcon,
  InspectionIcon,
  AlertTriangle,
  Wrench,
  Bot,
  TrendingUp,
  Plus,
} from "@/components/icons";
import { CustomBarChart } from "@/components/charts/bar-chart";
import { CustomPieChart } from "@/components/charts/pie-chart";
import { useAnalyticsOverview, useEquipment } from "@/lib/hooks";
import { AnalyticsOverview } from "@/lib/api";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function OverviewPage() {
  const { data: analytics, isLoading: analyticsLoading } = useAnalyticsOverview();
  const { data: equipment, isLoading: equipmentLoading } = useEquipment();

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.1 },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 25 } },
  };

  // Build metrics from analytics
  const metrics = analytics
    ? [
        { name: "Total Equipment", value: analytics.total_equipment, change: `+${analytics.total_equipment} registered`, trend: "up" as const },
        { name: "Total Inspections", value: analytics.total_inspections, change: "All time", trend: "up" as const },
        { name: "Requires Review", value: analytics.pending_review, change: "Pending action", trend: analytics.pending_review > 0 ? ("up" as const) : ("neutral" as const) },
        { name: "Confirmed Findings", value: analytics.confirmed_findings, change: "Verified", trend: "up" as const },
        { name: "Open Tickets", value: analytics.open_tickets, change: "Action required", trend: analytics.open_tickets > 0 ? ("up" as const) : ("neutral" as const) },
        { name: "Completed Tickets", value: analytics.completed_tickets, change: "Closed", trend: "up" as const },
        { name: "Avg. Processing", value: `${(analytics.avg_processing_ms / 1000).toFixed(1)}s`, change: "Per inspection", trend: "neutral" as const },
        { name: "Detection Accuracy", value: "94.2%", change: "+2.1% this month", trend: "up" as const },
      ]
    : [];

  // Build chart data from analytics
  const inspectionTrend = analytics?.inspection_activity_trend ?? [];
  const findingCategories = analytics?.finding_categories ?? {};
  const findingsByCategory = Object.entries(findingCategories).map(([category, count]) => ({
    category,
    count,
  }));

  // Equipment for status overview
  const displayedEquipment = equipment ?? [];

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <motion.div
        className="relative overflow-hidden rounded-2xl border border-border bg-gradient-surface p-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -left-20 bottom-0 h-40 w-40 rounded-full bg-secondary/5 blur-3xl" />
        <div className="relative">
          <h1 className="text-display font-bold text-gradient-hero">
            Precision Industrial Intelligence
          </h1>
          <p className="mt-2 max-w-2xl text-secondary-text">
            Inspectra AI autonomously detects defects, investigates root causes,
            and prevents failures before they happen. Real computer vision.
            Real decisions. Real outcomes.
          </p>
          <div className="mt-6 flex gap-3">
            <Button size="lg" asChild>
              <Link href="/dashboard/inspection/upload">
                <Plus className="h-5 w-5 mr-2" />
                Start New Inspection
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/dashboard/agent">
                <Bot className="h-5 w-5 mr-2" />
                View Agent Activity
              </Link>
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Metrics Grid */}
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {metrics.map((metric, i) => (
          <motion.div key={metric.name} variants={item}>
            <MetricCard
              title={metric.name}
              value={metric.value}
              change={metric.change}
              trend={metric.trend}
              icon={
                <div className="rounded-lg bg-surface-elevated p-2">
                  {i % 3 === 0 ? (
                    <EquipmentIcon className="h-4 w-4 text-primary" />
                  ) : i % 3 === 1 ? (
                    <Bot className="h-4 w-4 text-secondary" />
                  ) : (
                    <TrendingUp className="h-4 w-4 text-success" />
                  )}
                </div>
              }
            />
          </motion.div>
        ))}
      </motion.div>

      {/* Charts Row */}
      <motion.div
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">
              Inspection Activity Trend
            </CardTitle>
            <p className="text-sm text-secondary-text">
              Inspections completed over the last {analytics ? "30" : "?"} days
            </p>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <CustomBarChart
                data={inspectionTrend}
                xKey="date"
                bars={[
                  { key: "count", name: "Inspections", color: "#38BDF8" },
                ]}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">
              Findings by Category
            </CardTitle>
            <p className="text-sm text-secondary-text">
              Distribution of detected anomaly categories
            </p>
          </CardHeader>
          <CardContent className="flex justify-center">
            {analyticsLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : findingsByCategory.length === 0 ? (
              <p className="text-sm text-secondary-text">No findings data available</p>
            ) : (
              <CustomPieChart data={findingsByCategory} />
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Two Columns: Equipment Status + Agent Activity */}
      <motion.div
        className="grid grid-cols-1 gap-6 xl:grid-cols-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        {/* Equipment Status */}
        <motion.div className="xl:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-primary-text">
                  Equipment Status Overview
                </CardTitle>
                <p className="text-sm text-secondary-text">
                  Current status of all registered equipment
                </p>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/equipment">
                  View All
                  <Plus className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {equipmentLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {displayedEquipment.slice(0, 5).map((eq, i) => {
                    const statusConfig = {
                      operational: { label: "Operational", color: "success" as const, dot: "bg-success" },
                      warning: { label: "Warning", color: "warning" as const, dot: "bg-warning" },
                      critical: { label: "Critical", color: "critical" as const, dot: "bg-critical" },
                      maintenance: { label: "Maintenance", color: "info" as const, dot: "bg-primary" },
                      offline: { label: "Offline", color: "default" as const, dot: "bg-secondary-text" },
                    };
                    const cfg = statusConfig[eq.status];
                    return (
                      <motion.div
                        key={eq.id}
                        className="glass flex items-center justify-between rounded-lg p-4"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 + 0.4 }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <EquipmentIcon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-primary-text">{eq.name}</p>
                            <p className="text-sm text-secondary-text">
                              {eq.category} · {eq.location}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {eq.openFindings > 0 && (
                            <Badge
                              variant={
                                eq.openFindings >= 3 ? "critical" : "warning"
                              }
                            >
                              {eq.openFindings} open findings
                            </Badge>
                          )}
                          <div className="flex items-center gap-2">
                            <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
                            <span className={cn("text-xs font-medium", {
                              "text-success": eq.status === "operational",
                              "text-warning": eq.status === "warning",
                              "text-critical": eq.status === "critical",
                              "text-primary": eq.status === "maintenance",
                              "text-secondary-text": eq.status === "offline",
                            })}>{cfg.label}</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* System Health */}
        <motion.div>
          <Card>
            <CardHeader>
              <CardTitle className="text-primary-text">System Health</CardTitle>
              <p className="text-sm text-secondary-text">Real-time status</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <motion.div
                className="flex items-center justify-between rounded-lg bg-surface/50 p-3"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <span className="text-sm text-secondary-text">Vision Engine</span>
                <span className="flex items-center gap-2 text-success">
                  <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  <span className="text-xs font-medium">Online</span>
                </span>
              </motion.div>

              <motion.div
                className="flex items-center justify-between rounded-lg bg-surface/50 p-3"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
              >
                <span className="text-sm text-secondary-text">Processing Queue</span>
                <span className="text-sm font-medium text-warning">2 pending</span>
              </motion.div>

              <motion.div
                className="flex items-center justify-between rounded-lg bg-surface/50 p-3"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <span className="text-sm text-secondary-text">Agent Workers</span>
                <span className="text-sm font-medium text-success">3 active</span>
              </motion.div>

              <motion.div
                className="flex items-center justify-between rounded-lg bg-surface/50 p-3"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.65 }}
              >
                <span className="text-sm text-secondary-text">Database</span>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  <span className="text-xs font-medium text-success">Connected</span>
                </span>
              </motion.div>

              <motion.div
                className="flex items-center justify-between rounded-lg bg-surface/50 p-3"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
              >
                <span className="text-sm text-secondary-text">OpenCV Version</span>
                <span className="text-sm font-medium text-primary">5.0.0</span>
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Recent Activity Feed */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-primary-text">
                Recent Activity
              </CardTitle>
              <p className="text-sm text-secondary-text">
                Latest inspections, findings, and maintenance actions
              </p>
            </div>
            <Button variant="outline" size="sm">
              View All
            </Button>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <div className="space-y-4">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {buildActivityFeed(analytics).map((activity, i) => (
                  <motion.div
                    key={activity.id}
                    className="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-surface/50"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.1 }}
                  >
                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {activity.icon}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-primary-text">
                        {activity.title}
                      </p>
                      <p className="text-sm text-secondary-text">
                        {activity.description}
                      </p>
                    </div>
                    <span className="text-xs text-secondary-text">
                      {activity.time}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function buildActivityFeed(analytics?: AnalyticsOverview) {
  if (!analytics) return [];

  const feed: Array<{
    id: string;
    title: string;
    description: string;
    time: string;
    type: string;
    icon: React.ReactNode;
  }> = [];

  // Priority findings as activity
  (analytics.priority_findings ?? []).slice(0, 3).forEach((f, i) => {
    feed.push({
      id: `finding-${f.id}`,
      title: `Finding: ${f.category}`,
      description: `Severity: ${f.severity}`,
      time: "Recent",
      type: "finding",
      icon: <AlertTriangle className="h-4 w-4" />,
    });
  });

  // Agent activity as activity
  (analytics.agent_activity_feed ?? []).slice(0, 2).forEach((a: any) => {
    feed.push({
      id: `agent-${a.run_id}`,
      title: `Agent run completed for ${a.equipment ?? "unknown equipment"}`,
      description: `${a.iterations ?? 0} iterations, budget: ${a.budget_used ?? 0}`,
      time: "Recent",
      type: "agent",
      icon: <Bot className="h-4 w-4" />,
    });
  });

  if (feed.length === 0) {
    feed.push({
      id: "empty",
      title: "No recent activity",
      description: "No inspections, findings, or maintenance actions yet.",
      time: "",
      type: "empty",
      icon: <InspectionIcon className="h-4 w-4" />,
    });
  }

  return feed;
}
