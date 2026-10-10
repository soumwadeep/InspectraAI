"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomBarChart } from "@/components/charts/bar-chart";
import { useBenchmarks } from "@/lib/hooks";
import {
  Gauge,
  Download,
  Calendar,
  Cpu,
  Server,
  CheckCircle,
  TrendingUp,
  BarChart2,
  Clock,
  Target,
} from "@/components/icons";

// Inline fallback data for benchmark detail fields
const fallbackOperations = [
  { operation: "Resize (4K→1080p)", standardMs: 12.4, coolMs: 8.7, improvement: "30%" },
  { operation: "Color Conversion (BGR→HSV)", standardMs: 8.2, coolMs: 5.1, improvement: "38%" },
  { operation: "Gaussian Blur (5x5)", standardMs: 15.3, coolMs: 9.8, improvement: "36%" },
  { operation: "Adaptive Threshold", standardMs: 22.1, coolMs: 14.2, improvement: "36%" },
  { operation: "Morphological Ops", standardMs: 18.7, coolMs: 11.9, improvement: "36%" },
  { operation: "Canny Edge Detection", standardMs: 25.6, coolMs: 16.8, improvement: "34%" },
  { operation: "Contour Extraction", standardMs: 14.9, coolMs: 9.4, improvement: "37%" },
  { operation: "ORB Feature Detection", standardMs: 48.3, coolMs: 31.2, improvement: "35%" },
];

const fallbackAccuracy = {
  precision: 96.8,
  recall: 91.5,
  f1Score: 94.1,
  falsePositiveRate: 3.2,
  falseNegativeRate: 8.5,
};

const fallbackTestEnvironment = {
  opencvVersion: "5.0.0",
  coolVersion: "2.1.0",
  pythonVersion: "3.12",
  platform: "Linux aarch64 (AWS Graviton2)",
  cpuModel: "AWS Graviton2 (Neoverse N1)",
  memory: "8 GB",
  testImages: 50,
  iterations: 100,
};

const fallbackHardwareComparison = [
  { platform: "x86-64", resizeMs: 12.4, detectionMs: 48.3, totalMs: 512 },
  { platform: "Graviton2 (COOL)", resizeMs: 8.7, detectionMs: 31.2, totalMs: 342 },
  { platform: "Graviton2 (Standard)", resizeMs: 12.4, detectionMs: 48.3, totalMs: 512 },
];

type OperationsData = Array<{
  operation: string;
  standardMs: number;
  coolMs: number;
  improvement: string;
}>;

type AccuracyData = {
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
};

type TestEnvironmentData = {
  opencvVersion: string;
  coolVersion?: string;
  pythonVersion?: string;
  platform: string;
  cpuModel?: string;
  memory?: string;
  testImages: number;
  iterations: number;
};

type HardwareComparisonData = Array<{
  platform: string;
  resizeMs: number;
  detectionMs: number;
  totalMs: number;
}>;

export default function BenchmarksPage() {
  const { data: benchmarks, isLoading, isError } = useBenchmarks();

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

  // Pick the latest benchmark run for detailed display; fall back to inline data
  const latest = benchmarks?.[0];
  const results = (latest?.results ?? {}) as Record<string, unknown>;

  const operations: OperationsData =
    (results.operations as OperationsData) ?? fallbackOperations;

  const accuracy: AccuracyData =
    (results.accuracy as AccuracyData) ?? fallbackAccuracy;

  const testEnvironment: TestEnvironmentData =
    (results.test_environment as TestEnvironmentData) ??
    (latest?.config as TestEnvironmentData) ??
    fallbackTestEnvironment;

  const hardwareComparison: HardwareComparisonData =
    (results.hardware_comparison as HardwareComparisonData) ??
    fallbackHardwareComparison;

  if (isError) {
    return (
      <div className="space-y-6">
        <motion.div
          className="rounded-lg bg-critical/10 p-4 text-critical"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          Failed to load benchmark data. Please try again later.
        </motion.div>
      </div>
    );
  }

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
              Performance Benchmarks
            </h1>
            <p className="mt-1 text-secondary-text">
              {latest?.description ??
                "OpenCV 5 vision pipeline performance and COOL acceleration benchmarks"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Calendar className="h-4 w-4 mr-2" />
              Last 30 days
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export Benchmark
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
            title="Precision"
            value={`${isLoading ? "—" : accuracy.precision}%`}
            change="High confidence detections"
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
            title="Recall"
            value={`${isLoading ? "—" : accuracy.recall}%`}
            change="Anomaly capture rate"
            trend="up"
            icon={
              <div className="rounded-lg bg-surface-elevated p-2">
                <Target className="h-4 w-4 text-primary" />
              </div>
            }
          />
        </motion.div>
        <motion.div variants={item}>
          <MetricCard
            title="F1 Score"
            value={`${isLoading ? "—" : accuracy.f1Score}%`}
            change="Balanced metric"
            trend="neutral"
            icon={
              <div className="rounded-lg bg-surface-elevated p-2">
                <BarChart2 className="h-4 w-4 text-secondary" />
              </div>
            }
          />
        </motion.div>
        <motion.div variants={item}>
          <MetricCard
            title="False Positive Rate"
            value={`${isLoading ? "—" : accuracy.falsePositiveRate}%`}
            change="-48% vs baseline"
            trend="down"
            icon={
              <div className="rounded-lg bg-surface-elevated p-2">
                <TrendingUp className="h-4 w-4 text-critical" />
              </div>
            }
          />
        </motion.div>
      </motion.div>

      {/* Test Environment Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="border-border/50 bg-surface-elevated/30">
          <CardHeader>
            <CardTitle className="text-primary-text">Test Environment</CardTitle>
            <CardDescription>
              Vision pipeline benchmark configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex items-center gap-3">
                  <Cpu className="h-5 w-5 text-secondary-text" />
                  <div>
                    <p className="text-xs text-secondary-text">Processor</p>
                    <p className="font-medium text-primary-text">{testEnvironment.platform}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Server className="h-5 w-5 text-secondary-text" />
                  <div>
                    <p className="text-xs text-secondary-text">OpenCV</p>
                    <p className="font-medium text-primary-text">v{testEnvironment.opencvVersion}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-secondary-text" />
                  <div>
                    <p className="text-xs text-secondary-text">Iterations</p>
                    <p className="font-medium text-primary-text">{testEnvironment.iterations} per op</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Gauge className="h-5 w-5 text-secondary-text" />
                  <div>
                    <p className="text-xs text-secondary-text">Test Images</p>
                    <p className="font-medium text-primary-text">{testEnvironment.testImages} images</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* COOL Performance Comparison */}
      <motion.div
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">
              COOL Acceleration vs Standard OpenCV
            </CardTitle>
            <CardDescription>
              Per-operation latency reduction with COOL optimized routines
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : operations.length === 0 ? (
              <p className="text-sm text-secondary-text">No operation data available</p>
            ) : (
              <CustomBarChart
                data={operations}
                xKey="operation"
                bars={[
                  { key: "coolMs", name: "COOL (Optimized)", color: "#38BDF8" },
                  { key: "standardMs", name: "Standard OpenCV", color: "#64748B" },
                ]}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">
              Hardware Platform Comparison
            </CardTitle>
            <CardDescription>
              Total processing time across platforms
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : hardwareComparison.length === 0 ? (
              <p className="text-sm text-secondary-text">No hardware comparison data available</p>
            ) : (
              <CustomBarChart
                data={hardwareComparison}
                xKey="platform"
                bars={[
                  { key: "totalMs", name: "Total Time (ms)", color: "#22D3EE" },
                ]}
              />
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Detailed Operations Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Operation Details</CardTitle>
            <CardDescription>
              Side-by-side comparison of COOL-optimized vs standard OpenCV 5 performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {operations.map((op, i) => (
                  <motion.div
                    key={op.operation}
                    className="glass flex items-center justify-between rounded-lg p-4"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.05 }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Gauge className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-primary-text">{op.operation}</p>
                        <p className="text-xs text-secondary-text">
                          Standard: {op.standardMs}ms · COOL: {op.coolMs}ms
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="w-32">
                        <div className="flex justify-between text-xs">
                          <span className="text-secondary-text">COOL Latency</span>
                          <span className="text-primary-text">{op.coolMs}ms</span>
                        </div>
                        <div className="mt-1 h-2 w-full rounded-full bg-surface-elevated">
                          <div
                            className="h-2 rounded-full bg-primary"
                            style={{ width: `${(op.coolMs / op.standardMs) * 100}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-16 text-right">
                        <Badge variant="success" className="font-mono">
                          {op.improvement}
                        </Badge>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Accuracy Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">
              Detection Accuracy Breakdown
            </CardTitle>
            <CardDescription>
              Confusion matrix results from 50 test images with 100 iterations
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="rounded-lg bg-surface/30 p-4">
                    <p className="text-sm text-secondary-text">False Positive Rate</p>
                    <div className="mt-1 text-2xl font-bold text-success">
                      {accuracy.falsePositiveRate}%
                    </div>
                  </div>
                  <div className="rounded-lg bg-surface/30 p-4">
                    <p className="text-sm text-secondary-text">False Negative Rate</p>
                    <div className="mt-1 text-2xl font-bold text-warning">
                      {accuracy.falseNegativeRate}%
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="rounded-lg bg-surface/30 p-4">
                    <p className="text-sm text-secondary-text">Precision</p>
                    <div className="mt-1 text-2xl font-bold text-primary">
                      {accuracy.precision}%
                    </div>
                  </div>
                  <div className="rounded-lg bg-surface/30 p-4">
                    <p className="text-sm text-secondary-text">Recall</p>
                    <div className="mt-1 text-2xl font-bold text-secondary">
                      {accuracy.recall}%
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
