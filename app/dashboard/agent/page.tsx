"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { StatusDot } from "@/components/ui/status-dot";
import { MetricCard } from "@/components/ui/metric-card";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomBarChart } from "@/components/charts/bar-chart";
import { useAgentRuns } from "@/lib/hooks";
import { AgentRun, AgentStep } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import {
  Bot,
  Eye,
  Clock3,
  CheckCircle,
  XCircle,
  Download,
  Calendar,
  RefreshCw,
  Zap,
  Activity,
  BarChart2,
  Target,
  Plus,
} from "@/components/icons";

const statusVariant = {
  running: "info",
  completed: "success",
  failed: "critical",
} as const;

const statusDotMap = {
  running: "processing",
  completed: "online",
  failed: "offline",
} as const;

const columns: ColumnDef<AgentRun>[] = [
  {
    accessorKey: "id",
    header: "Run ID",
    cell: ({ row }) => (
      <code className="text-xs text-secondary-text">{row.getValue("id")}</code>
    ),
  },
  {
    accessorKey: "equipmentName",
    header: "Equipment",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-secondary-text" />
        <span className="font-medium text-primary-text">{row.getValue("equipmentName") ?? "Unknown"}</span>
      </div>
    ),
  },
  {
    accessorKey: "inspectionId",
    header: "Inspection",
    cell: ({ row }) => (
      <code className="text-xs text-secondary-text">{row.getValue("inspectionId")}</code>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as "running" | "completed" | "failed";
      return (
        <div className="flex items-center gap-2">
          <StatusDot status={statusDotMap[status]} size="sm" showPulse={status === "running"} />
          <Badge variant={statusVariant[status]}>
            {status}
          </Badge>
        </div>
      );
    },
  },
  {
    accessorKey: "iterations",
    header: "Iterations",
    cell: ({ row }) => (
      <span className="text-sm text-primary-text">{row.getValue("iterations")}</span>
    ),
  },
  {
    accessorKey: "budgetUsed",
    header: "Budget Used",
    cell: ({ row }) => (
      <span className="text-sm text-secondary-text">{row.getValue("budgetUsed")} / 20</span>
    ),
  },
  {
    accessorKey: "startTime",
    header: "Started",
    cell: ({ row }) => (
      <span className="text-sm text-secondary-text">
        {formatDate(row.getValue("startTime"))}
      </span>
    ),
  },
  {
    accessorKey: "finalAction",
    header: "Final Action",
    cell: ({ row }) => (
      <code className="text-xs text-secondary-text">{row.getValue("finalAction") ?? "—"}</code>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const run = row.original;
      return (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon-sm" asChild>
            <a href={`/dashboard/agent/${run.id}`}>
              <Eye className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      );
    },
  },
];

export default function AgentPage() {
  const { data: agentRuns, isLoading } = useAgentRuns();

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

  const runs = agentRuns ?? [];
  const completedCount = runs.filter((r) => r.status === "completed").length;
  const runningCount = runs.filter((r) => r.status === "running").length;
  const avgIterations = runs.length
    ? Math.round(runs.reduce((sum, r) => sum + r.iterations, 0) / runs.length)
    : 0;
  const avgBudget = runs.length
    ? Math.round(runs.reduce((sum, r) => sum + r.budgetUsed, 0) / runs.length)
    : 0;

  // Derive tool utilization from agent runs steps
  const toolCounts: Record<string, number> = {};
  runs.forEach((run) => {
    run.steps.forEach((step) => {
      toolCounts[step.tool] = (toolCounts[step.tool] || 0) + 1;
    });
  });
  const toolInvocationsData = Object.entries(toolCounts).map(([tool, count]) => ({
    tool,
    invocations: count,
    color: "#38BDF8",
  }));

  const latestRun = runs[0];

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-display font-bold text-gradient-hero">
              Agent Activity
            </h1>
            <p className="mt-1 text-secondary-text">
              Autonomous vision agent runs, tool invocations, and inspection outcomes
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Calendar className="h-4 w-4 mr-2" />
              Last 30 days
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export Logs
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-4"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={item}>
          <MetricCard
            title="Total Runs"
            value={isLoading ? "—" : runs.length}
            change="All time"
            trend="neutral"
            icon={
              <div className="rounded-lg bg-surface-elevated p-2">
                <Activity className="h-4 w-4 text-primary" />
              </div>
            }
          />
        </motion.div>
        <motion.div variants={item}>
          <MetricCard
            title="Completed"
            value={isLoading ? "—" : completedCount}
            change={`${completedCount}/${runs.length} successful`}
            trend="up"
            icon={
              <div className="rounded-lg bg-surface-elevated p-2">
                <CheckCircle className="h-4 w-4 text-success" />
              </div>
            }
          />
        </motion.div>
        <motion.div variants={item}>
          <MetricCard
            title="Running"
            value={isLoading ? "—" : runningCount}
            change="Active agents"
            trend="neutral"
            icon={
              <div className="rounded-lg bg-surface-elevated p-2">
                <Bot className="h-4 w-4 text-secondary" />
              </div>
            }
          />
        </motion.div>
        <motion.div variants={item}>
          <MetricCard
            title="Avg Budget Used"
            value={isLoading ? "—" : `${avgBudget}`}
            change="Per inspection"
            trend="neutral"
            icon={
              <div className="rounded-lg bg-surface-elevated p-2">
                <Zap className="h-4 w-4 text-warning" />
              </div>
            }
          />
        </motion.div>
      </motion.div>

      {/* Charts */}
      <motion.div
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">
              Tool Invocations
            </CardTitle>
            <CardDescription>
              How often each agent tool was called across all runs
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : toolInvocationsData.length === 0 ? (
              <p className="text-sm text-secondary-text">No tool invocation data available</p>
            ) : (
              <CustomBarChart
                data={toolInvocationsData}
                xKey="tool"
                bars={[
                  { key: "invocations", name: "Invocations", color: "#38BDF8" },
                ]}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">
              Iterations &amp; Budget
            </CardTitle>
            <CardDescription>
              Agent loop depth and budget consumption per run
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : runs.length === 0 ? (
              <p className="text-sm text-secondary-text">No agent runs available</p>
            ) : (
              <CustomBarChart
                data={runs.map((r) => ({
                  run: r.id.split("_")[1] || r.id,
                  iterations: r.iterations,
                }))}
                xKey="run"
                bars={[
                  { key: "iterations", name: "Iterations", color: "#A78BAA" },
                ]}
              />
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Recent Agent Runs Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-primary-text">Agent Run History</CardTitle>
              <CardDescription>
                {isLoading ? "Loading..." : `${runs.length} total runs`}
              </CardDescription>
            </div>
            <Button asChild size="sm">
              <a href="/dashboard/agent/new">
                <Plus className="h-4 w-4 mr-2" />
                New Agent Run
              </a>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <DataTable
                columns={columns}
                data={runs}
                enableSearch
                searchKey="id"
                searchPlaceholder="Search agent runs..."
                pageSize={10}
              />
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Latest Run Detail */}
      {latestRun && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-primary-text">
                Latest Agent Run — {latestRun.id}
              </CardTitle>
              <CardDescription>
                Perception → Decision → Action workflow steps
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {latestRun.steps.map((step: AgentStep, i: number) => {
                  const isLast = i === latestRun.steps.length - 1;
                  return (
                    <motion.div
                      key={step.id}
                      className="flex items-start gap-4 rounded-lg bg-surface/30 p-4"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + i * 0.05 }}
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <span className="text-xs font-bold">{step.step}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-primary">
                            {step.tool}
                          </code>
                          {step.action === "completed" ? (
                            <CheckCircle className="h-3 w-3 text-success" />
                          ) : step.action === "failed" ? (
                            <XCircle className="h-3 w-3 text-critical" />
                          ) : (
                            <Clock3 className="h-3 w-3 text-warning animate-pulse" />
                          )}
                        </div>
                        <p className="mt-1 text-sm text-primary-text">
                          {step.description}
                        </p>
                        {step.resultSummary && (
                          <p className="text-xs text-secondary-text mt-1">
                            {step.resultSummary}
                          </p>
                        )}
                      </div>
                      {step.duration && (
                        <Badge variant="default" className="text-xs">
                          {step.duration}ms
                        </Badge>
                      )}
                      {isLast && (
                        <Badge variant="success" className="text-xs">
                          final
                        </Badge>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
