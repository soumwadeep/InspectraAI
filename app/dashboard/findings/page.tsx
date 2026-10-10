"use client";

import { motion } from "framer-motion";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/ui/data-table";
import { SeverityIndicator } from "@/components/ui/severity-indicator";
import { useFindings, useEquipment } from "@/lib/hooks";
import { Finding, Equipment } from "@/lib/types";
import { cn, formatRelativeTime, truncate } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  Eye,
  CheckCircle,
  XCircle,
  Filter,
  Download,
  Wrench,
  Clock3,
} from "@/components/icons";
import Link from "next/link";

const verificationVariant = {
  verified: "success" as const,
  unverified: "warning" as const,
  rejected: "critical" as const,
};

const resolutionVariant = {
  "pending-review": "warning" as const,
  confirmed: "info" as const,
  rejected: "critical" as const,
  "needs-evidence": "warning" as const,
  "in-progress": "info" as const,
  resolved: "success" as const,
};

const severityVariant = {
  critical: "critical" as const,
  warning: "warning" as const,
  info: "info" as const,
  success: "success" as const,
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
      cell: ({ row }) => (
        <Badge variant={verificationVariant[row.getValue("verificationStatus")]}>
          {row.getValue("verificationStatus")}
        </Badge>
      ),
    },
    {
      accessorKey: "resolutionState",
      header: "Resolution",
      cell: ({ row }) => (
        <Badge variant={resolutionVariant[row.getValue("resolutionState")]}>
          {row.getValue("resolutionState")}
        </Badge>
      ),
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
  const [filterOpen, setFilterOpen] = useState(false);
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setFilterOpen(!filterOpen)}>
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
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
