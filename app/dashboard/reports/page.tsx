"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Download } from "@/components/icons";
import {
  useEquipment,
  useFindings,
  useInspections,
  useTickets,
} from "@/lib/hooks";
import { downloadFile, exportTimestamp, toCsv, toJson } from "@/lib/export";
import { entry, stagger } from "@/lib/motion/presets";
import { useToast } from "@/components/ui/use-toast";

interface Dataset {
  key: string;
  title: string;
  description: string;
  rows: readonly unknown[];
  columns: string[];
  loading: boolean;
  error: boolean;
}

export default function ReportsPage() {
  const { toast } = useToast();
  const findings = useFindings();
  const tickets = useTickets();
  const inspections = useInspections();
  const equipment = useEquipment();

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
      description: "Assigned work, priority and repair-verification outcome.",
      rows: tickets.data ?? [],
      columns: [
        "id",
        "equipmentId",
        "findingId",
        "priority",
        "status",
        "assignedOperator",
        "dueDate",
        "repairVerification",
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
      <div>
        <h1 className="text-title font-bold text-primary-text">Data export</h1>
        <p className="mt-1 text-secondary-text">
          Files are generated from the records currently stored for your
          organization. Counts below are the rows that will be written.
        </p>
      </div>

      <motion.div
        className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="text-sm">
          <p className="font-medium text-primary-text">Not implemented</p>
          <p className="text-secondary-text">
            PDF inspection reports and a server-side export endpoint do not
            exist yet. CSV and JSON here are assembled in the browser from live
            API data, so an export reflects exactly what you can see on screen.
          </p>
        </div>
      </motion.div>

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
                <CardTitle className="text-primary-text">{dataset.title}</CardTitle>
                <p className="text-sm text-secondary-text">{dataset.description}</p>
              </CardHeader>
              <CardContent>
                {dataset.loading ? (
                  <Skeleton className="h-16 w-full" />
                ) : dataset.error ? (
                  <p className="text-sm text-critical">
                    Could not load {dataset.title.toLowerCase()}. The API may not be
                    running.
                  </p>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-mono text-sm tabular-nums text-secondary-text">
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
