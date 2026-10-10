"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomBarChart } from "@/components/charts/bar-chart";
import { CustomLineChart } from "@/components/charts/line-chart";
import { CustomPieChart } from "@/components/charts/pie-chart";
import {
  BarChart2,
  PieChart,
  Activity,
  Target,
  TrendingUp,
  Shield,
  Download,
  Calendar,
} from "@/components/icons";
import { useAnalyticsOverview, useEquipment, useAgentRuns } from "@/lib/hooks";
import { AnalyticsOverview } from "@/lib/api";
import { formatDate } from "@/lib/utils";

// Inline fallback data for charts without direct API equivalents
const processingLatencyData = [
  { range: "0-1s", count: 1200 },
  { range: "1-2s", count: 850 },
  { range: "2-3s", count: 420 },
  { range: "3-5s", count: 180 },
  { range: "5s+", count: 45 },
];

const reviewOutcomesData = [
  { name: "Confirmed", value: 110, color: "#10B981" },
  { name: "Rejected", value: 24, color: "#EF4444" },
  { name: "Needs Evidence", value: 12, color: "#F59E0B" },
  { name: "Resolved", value: 8, color: "#38BDF8" },
];

const falsePositiveRateData = [
  { month: "Jan", rate: 5.2 },
  { month: "Feb", rate: 4.8 },
  { month: "Mar", rate: 4.1 },
  { month: "Apr", rate: 3.9 },
  { month: "May", rate: 3.2 },
  { month: "Jun", rate: 2.8 },
  { month: "Jul", rate: 2.4 },
  { month: "Aug", rate: 2.1 },
];

const detectionAccuracyData = [
  { operation: "Corrosion", precision: 94.2, recall: 89.1 },
  { operation: "Leakage", precision: 87.5, recall: 82.3 },
  { operation: "Crack", precision: 91.0, recall: 76.5 },
  { operation: "Displacement", precision: 96.8, recall: 93.2 },
  { operation: "Surface Change", precision: 88.3, recall: 85.7 },
];

export default function AnalyticsPage() {
  const { data: analytics, isLoading: analyticsLoading } = useAnalyticsOverview(30);
  const { data: equipment } = useEquipment();
  const { data: agentRuns } = useAgentRuns();

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

  // Build findings-by-category data from API
  const findingsByCategory = analytics
    ? Object.entries(analytics.finding_categories).map(([category, count]) => ({
        name: category,
        value: count as number,
        color: ["#EF4444", "#22D3EE", "#F59E0B", "#A78BAA", "#38BDF8", "#10B981"][
          Object.keys(analytics.finding_categories).indexOf(category) % 6
        ],
      }))
    : [];

  // Derive tool utilization from agent runs
  const toolUtilizationData = agentRuns
    ? (() => {
        const counts: Record<string, number> = {};
        agentRuns.forEach((run) => {
          run.steps.forEach((step) => {
            counts[step.tool] = (counts[step.tool] || 0) + 1;
          });
        });
        return Object.entries(counts).map(([tool, count]) => ({
          tool,
          invocations: count,
          color: "#38BDF8",
        }));
      })()
    : [];

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
              Analytics &amp; Performance
            </h1>
            <p className="mt-1 text-secondary-text">
              Inspection performance metrics, detection accuracy, and agent effectiveness
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Calendar className="h-4 w-4 mr-2" />
              Last 30 days
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export Data
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={item}>
          <MetricCard
            title="Detection Accuracy"
            value="94.2%"
            change="+2.1% this month"
            trend="up"
            icon={
              <div className="rounded-lg bg-surface-elevated p-2">
                <Target className="h-4 w-4 text-success" />
              </div>
            }
          />
        </motion.div>
        <motion.div variants={item}>
          <MetricCard
            title="Avg. Processing Time"
            value={analytics ? `${(analytics.avg_processing_ms / 1000).toFixed(1)}s` : "2.4s"}
            change="-0.3s avg"
            trend="down"
            icon={
              <div className="rounded-lg bg-surface-elevated p-2">
                <Activity className="h-4 w-4 text-primary" />
              </div>
            }
          />
        </motion.div>
        <motion.div variants={item}>
          <MetricCard
            title="False Positive Rate"
            value="3.2%"
            change="-1.8% this month"
            trend="down"
            icon={
              <div className="rounded-lg bg-surface-elevated p-2">
                <Shield className="h-4 w-4 text-warning" />
              </div>
            }
          />
        </motion.div>
        <motion.div variants={item}>
          <MetricCard
            title="Agent Task Success"
            value="87.6%"
            change="+3.2% this month"
            trend="up"
            icon={
              <div className="rounded-lg bg-surface-elevated p-2">
                <TrendingUp className="h-4 w-4 text-success" />
              </div>
            }
          />
        </motion.div>
      </motion.div>

      {/* Charts Row 1 */}
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
            <CardDescription>
              Number of inspections completed per day
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : !analytics?.inspection_activity_trend?.length ? (
              <p className="text-sm text-secondary-text">No activity data available</p>
            ) : (
              <CustomBarChart
                data={analytics.inspection_activity_trend}
                xKey="date"
                bars={[{ key: "count", name: "Inspections", color: "#38BDF8" }]}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">
              Findings by Category
            </CardTitle>
            <CardDescription>
              Distribution of detected anomaly types
            </CardDescription>
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

      {/* Charts Row 2 */}
      <motion.div
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">
              Processing Latency Distribution
            </CardTitle>
            <CardDescription>
              How quickly inspections complete by time bucket
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CustomBarChart
              data={processingLatencyData}
              xKey="range"
              bars={[{ key: "count", name: "Inspections", color: "#22D3EE" }]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">
              Review Outcomes
            </CardTitle>
            <CardDescription>
              How findings are resolved by human reviewers
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <CustomPieChart data={reviewOutcomesData} />
          </CardContent>
        </Card>
      </motion.div>

      {/* Charts Row 3 */}
      <motion.div
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">
              Agent Tool Utilization
            </CardTitle>
            <CardDescription>
              How often each agent tool is invoked and its average duration
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : toolUtilizationData.length === 0 ? (
              <p className="text-sm text-secondary-text">No agent activity data available</p>
            ) : (
              <CustomBarChart
                data={toolUtilizationData}
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
              False Positive Rate Over Time
            </CardTitle>
            <CardDescription>
              Monthly trend in false positive detections
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CustomLineChart
              data={falsePositiveRateData}
              xKey="month"
              lines={[
                { key: "rate", name: "False Positive Rate (%)", color: "#EF4444" },
              ]}
            />
          </CardContent>
        </Card>
      </motion.div>

      {/* Detection Accuracy Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">
              Detection Accuracy by Category
            </CardTitle>
            <CardDescription>
              Precision and recall for each anomaly type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {detectionAccuracyData.map((item, i) => (
                <motion.div
                  key={item.operation}
                  className="flex items-center justify-between rounded-lg bg-surface/20 p-4"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + i * 0.05 }}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <BarChart2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-primary-text">{item.operation}</p>
                      <p className="text-xs text-secondary-text">
                        Precision: {item.precision}% · Recall: {item.recall}%
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="w-24">
                      <div className="flex justify-between text-xs">
                        <span className="text-secondary-text">Precision</span>
                        <span className="text-primary-text">{item.precision}%</span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-surface-elevated">
                        <div
                          className="h-2 rounded-full bg-success"
                          style={{ width: `${item.precision}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-24">
                      <div className="flex justify-between text-xs">
                        <span className="text-secondary-text">Recall</span>
                        <span className="text-primary-text">{item.recall}%</span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-surface-elevated">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: `${item.recall}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-16 text-right">
                      <span className="text-sm font-medium text-success">
                        {Math.round((item.precision + item.recall) / 2)}%
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
