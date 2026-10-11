"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/ui/data-table";
import { ExportButton } from "@/components/mission/export-button";
import { SeverityIndicator } from "@/components/ui/severity-indicator";
import { useFindings, useEquipment } from "@/lib/hooks";
import {
  BadgeVariant,
  Equipment,
  Finding,
  FindingStatus,
  Severity,
  VerificationStatus,
} from "@/lib/types";
import { cn, formatRelativeTime, truncate } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  Eye,
  CheckCircle,
  XCircle,
  Wrench,
  Clock3,
} from "@/components/icons";
import Link from "next/link";

const verificationVariant: Record<VerificationStatus, BadgeVariant> = {
  verified: "success",
  unverified: "warning",
  rejected: "critical",
};

const resolutionVariant: Record<FindingStatus, BadgeVariant> = {
  "pending-review": "warning",
  confirmed: "info",
  rejected: "critical",
  "needs-evidence": "warning",
  "in-progress": "info",
  resolved: "success",
};

const severityVariant: Record<Severity, BadgeVariant> = {
  critical: "critical",
  warning: "warning",
  info: "info",
  success: "success",
};

function buildColumns(equipmentMap: Map<string, Equipment>): ColumnDef<Finding>[] {
  return [
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-secondary-text" />
          <span className="font-medium text-primary-text">{row.getValue("category")}</span>
        </div>
      ),
    },
    {
      accessorKey: "equipmentId",
      header: "Equipment",
      cell: ({ row }) => {
        const eq = equipmentMap.get(row.getValue("equipmentId"));
        return <span className="text-sm text-primary-text">{eq?.name || "Unknown"}</span>;
      },
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <p className="max-w-xs text-sm text-secondary-text">
          {truncate(row.getValue("description"), 80)}
        </p>
      )
    },
    {
      accessorKey: "severity",
      header: "Severity",
      cell: ({ row }) => <SeverityIndicator severity={row.getValue("severity")} />,
    },
    {
      accessorKey: "confidence",
      header: "Confidence",
      cell: ({ row }) => {
        const c = row.getValue("confidence") as number;
        const color = c >= 0.8 ? "text-success" : c >= 0.6 ? "text-warning" : "text-critical";
        return (
          <span className={cn("text-sm font-medium", color)}>
            {Math.round(c * 100)}%
          </span>
        );
      },
    },
    {
      accessorKey: "verificationStatus",
      header: "Verification",
      cell: ({ row }) => {
        const status = row.getValue<VerificationStatus>("verificationStatus");
        return <Badge variant={verificationVariant[status]}>{status}</Badge>;
      },
    },
    {
      accessorKey: "resolutionState",
      header: "Resolution",
      cell: ({ row }) => {
        const state = row.getValue<FindingStatus>("resolutionState");
        return <Badge variant={resolutionVariant[state]}>{state}</Badge>;
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-sm text-secondary-text">
          {formatRelativeTime(row.getValue("createdAt"))}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const finding = row.original;
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon-sm" asChild>
              <Link href={`/dashboard/findings/${finding.id}`}>
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </Button>
            {finding.resolutionState === "resolved" ? (
              <CheckCircle className="h-4 w-4 text-success" />
            ) : finding.resolutionState === "rejected" ? (
              <XCircle className="h-4 w-4 text-critical" />
            ) : (
              <Wrench className="h-4 w-4 text-warning" />
            )}
          </div>
        );
      },
    },
  ];
}

export default function FindingsPage() {
  const { data: findings = [], isLoading: findingsLoading } = useFindings();
  const { data: equipment = [], isLoading: equipmentLoading } = useEquipment();

  const equipmentMap = useMemo(() => {
    const map = new Map<string, Equipment>();
    equipment.forEach((eq) => map.set(eq.id, eq));
    return map;
  }, [equipment]);

  const columns = useMemo(() => buildColumns(equipmentMap), [equipmentMap]);

  const loading = findingsLoading || equipmentLoading;

  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;
  const resolvedCount = findings.filter((f) => f.resolutionState === "resolved").length;

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display font-bold text-gradient-hero">
            Findings
          </h1>
          <p className="mt-1 text-secondary-text">
            Review and manage all detected anomalies and defects
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-secondary-text tabular-nums sm:inline">
            {criticalCount} critical · {warningCount} warning · {resolvedCount} resolved
          </span>
          <ExportButton
            rows={findings}
            columns={[
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
            ]}
            name="findings"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-critical">{criticalCount}</div>
              <p className="text-sm text-secondary-text">Critical Findings</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-warning">{warningCount}</div>
              <p className="text-sm text-secondary-text">Warnings</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-success">{resolvedCount}</div>
              <p className="text-sm text-secondary-text">Resolved</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-primary-text">All Findings</CardTitle>
          <p className="text-sm text-secondary-text">
            {loading ? "Loading..." : `${findings.length} total findings`}
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={findings}
              enableSearch
              searchKey="category"
              searchPlaceholder="Search findings..."
              pageSize={15}
            />
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
