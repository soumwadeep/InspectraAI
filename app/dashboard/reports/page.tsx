"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Download, RefreshCw } from "@/components/icons";
import {
  useAgentRuns,
  useBenchmarks,
  useEquipment,
  useFindings,
  useInspections,
  useTickets,
} from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";
import { downloadFile, exportTimestamp, toCsv, toJson } from "@/lib/export";
import { entry, stagger } from "@/lib/motion/presets";
import { useToast } from "@/components/ui/use-toast";
import {
  buildReportModel,
  REPORT_WINDOWS,
  reportToText,
  type ReportModel,
  type ReportWindow,
} from "@/components/reports/report-data";
import { ReportDocument } from "@/components/reports/report-document";

interface Dataset {
  key: string;
  title: string;
  description: string;
  rows: readonly unknown[];
  columns: string[];
  loading: boolean;
  error: boolean;
}

function ModelJson(model: ReportModel): string {
  // Dates are already ISO-serialisable; keep the whole model so an exported
  // report carries its own scope header next to the numbers.
  return JSON.stringify({ ...model, generatedAt: model.generatedAt.toISOString(),
    windowStart: model.windowStart ? model.windowStart.toISOString() : null }, null, 2);
}

export default function ReportsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const findings = useFindings();
  const tickets = useTickets();
  const inspections = useInspections();
  const equipment = useEquipment();
  const agentRuns = useAgentRuns();
  const benchmarks = useBenchmarks();

  const [window_, setWindow] = useState<ReportWindow>(REPORT_WINDOWS[1]);
  const [generatedAt, setGeneratedAt] = useState(() => new Date());

  const sourceErrors = {
    inspections: inspections.isError,
    findings: findings.isError,
    tickets: tickets.isError,
    agentRuns: agentRuns.isError,
    benchmarks: benchmarks.isError,
  };

  const model = useMemo(
    () =>
      buildReportModel({
        window: window_,
        generatedAt,
        organization: user
          ? { id: user.organizationId, email: user.email, role: user.role }
          : null,
        sourceErrors,
        inspections: inspections.data ?? null,
        findings: findings.data ?? null,
        tickets: tickets.data ?? null,
        agentRuns: agentRuns.data ?? null,
        benchmarks: benchmarks.data ?? null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      window_,
      generatedAt,
      user,
      inspections.data,
      findings.data,
      tickets.data,
      agentRuns.data,
      benchmarks.data,
      inspections.isError,
      findings.isError,
      tickets.isError,
      agentRuns.isError,
      benchmarks.isError,
    ],
  );

  const anyLoading =
    inspections.isLoading ||
    findings.isLoading ||
    tickets.isLoading ||
    agentRuns.isLoading ||
    benchmarks.isLoading;

  function downloadReport(format: "txt" | "json") {
    const stamp = exportTimestamp();
    if (format === "txt") {
      downloadFile(
        `inspectra-report-${window_.days ?? "all"}d-${stamp}.txt`,
        reportToText(model),
        "text/plain",
      );
    } else {
      downloadFile(
        `inspectra-report-${window_.days ?? "all"}d-${stamp}.json`,
        ModelJson(model),
        "application/json",
      );
    }
    toast({
      title: "Report downloaded",
      description: `Window "${window_.label}" · built from the rows the API returned.`,
    });
  }

  const stamp = exportTimestamp();

  const datasets: Dataset[] = [
    {
      key: "findings",
      title: "Findings",
      description: "Every detected anomaly with severity, confidence and review state.",
      rows: findings.data ?? [],
      columns: [
        "id",
        "equipmentId",
        "inspectionId",
        "category",
        "severity",
        "confidence",
        "verificationStatus",
        "resolutionState",
        "description",
        "createdAt",
      ],
      loading: findings.isLoading,
      error: findings.isError,
    },
    {
      key: "tickets",
      title: "Maintenance tickets",
      description: "Assigned work, priority and completion notes.",
      rows: tickets.data ?? [],
      columns: [
        "id",
        "equipmentId",
        "findingId",
        "priority",
        "status",
        "assignedOperator",
        "dueDate",
        "description",
        "createdAt",
      ],
      loading: tickets.isLoading,
      error: tickets.isError,
    },
    {
      key: "inspections",
      title: "Inspections",
      description: "Runs with their agent-run link, status and duration.",
      rows: inspections.data ?? [],
      columns: [
        "id",
        "equipmentId",
        "inspectorId",
        "status",
        "startTime",
        "endTime",
        "duration",
        "agentRunId",
      ],
      loading: inspections.isLoading,
      error: inspections.isError,
    },
    {
      key: "equipment",
      title: "Equipment registry",
      description: "Registered assets with location, status and open-finding counts.",
      rows: equipment.data ?? [],
      columns: [
        "id",
        "name",
        "category",
        "location",
        "status",
        "openFindings",
        "serialNumber",
        "manufacturer",
      ],
      loading: equipment.isLoading,
      error: equipment.isError,
    },
  ];

  function exportDataset(dataset: Dataset, format: "csv" | "json") {
    if (dataset.rows.length === 0) {
      toast({
        title: "Nothing to export",
        description: `${dataset.title} has no records yet. Run an inspection first.`,
        variant: "default",
      });
      return;
    }

    if (format === "csv") {
      downloadFile(
        `inspectra-${dataset.key}-${stamp}.csv`,
        toCsv(dataset.rows, dataset.columns),
        "text/csv",
      );
    } else {
      downloadFile(
        `inspectra-${dataset.key}-${stamp}.json`,
        toJson(dataset.rows, { columns: dataset.columns }),
        "application/json",
      );
    }

    toast({
      title: `${dataset.title} exported`,
      description: `${dataset.rows.length} record(s) written as ${format.toUpperCase()}.`,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-title font-bold text-primary-text">Reports</h1>
          <p className="mt-1 max-w-2xl text-secondary-text">
            Each line of the report below is a direct read, count or quantile of rows the API
            returned for your organization inside the selected window. Sections with no rows say
            so; sections whose endpoint failed say that instead of showing a zero.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setGeneratedAt(new Date());
              void Promise.all([
                inspections.refetch(),
                findings.refetch(),
                tickets.refetch(),
                agentRuns.refetch(),
                benchmarks.refetch(),
              ]);
            }}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Regenerate
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadReport("txt")}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Report (.txt)
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadReport("json")}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Report (.json)
          </Button>
        </div>
      </div>

      {/* Window selector */}
      <motion.div
        className="flex flex-wrap items-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <span className="text-kicker uppercase text-secondary-text">Time window</span>
        {REPORT_WINDOWS.map((option) => (
          <Button
            key={option.label}
            variant={option.days === window_.days ? "default" : "outline"}
            size="sm"
            onClick={() => setWindow(option)}
          >
            {option.label}
          </Button>
        ))}
        <Badge variant="outline">
          Generated <span className="telemetry">{generatedAt.toISOString().slice(0, 16)}Z</span>
        </Badge>
      </motion.div>

      <motion.div
        className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="text-sm">
          <p className="font-medium text-primary-text">Assembled in the browser from live API rows</p>
          <p className="text-secondary-text">
            There is no server-side report endpoint and no PDF writer, so neither is offered.
            Windowing uses row timestamps (<code className="font-mono">started_at</code> /{" "}
            <code className="font-mono">created_at</code>) against the browser clock shown above.
            List endpoints cap how many rows they return, which the scope section states.
          </p>
        </div>
      </motion.div>

      {anyLoading ? (
        <div className="space-y-5">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : (
        <ReportDocument model={model} />
      )}

      {/* Raw row exports — unchanged behaviour, still capped by the same endpoints. */}
      <motion.div
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        variants={stagger.rail}
        initial="hidden"
        animate="visible"
      >
        {datasets.map((dataset) => (
          <motion.div key={dataset.key} variants={entry.boot}>
            <Card>
              <CardHeader>
                <CardTitle className="text-primary-text">
                  Raw export — {dataset.title}
                </CardTitle>
                <p className="text-sm text-secondary-text">{dataset.description}</p>
              </CardHeader>
              <CardContent>
                {dataset.loading ? (
                  <Skeleton className="h-16 w-full" />
                ) : dataset.error ? (
                  <p className="text-sm text-critical">
                    Could not load {dataset.title.toLowerCase()}. The API may not be running.
                  </p>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <span className="telemetry text-sm tabular-nums text-secondary-text">
                      {dataset.rows.length} record{dataset.rows.length === 1 ? "" : "s"}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportDataset(dataset, "csv")}
                        disabled={dataset.rows.length === 0}
                      >
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        CSV
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportDataset(dataset, "json")}
                        disabled={dataset.rows.length === 0}
                      >
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        JSON
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
