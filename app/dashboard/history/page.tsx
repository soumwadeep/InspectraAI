"use client";

import { motion } from "framer-motion";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/ui/data-table";
import { StatusDot } from "@/components/ui/status-dot";
import { useInspections, useEquipment } from "@/lib/hooks";
import { Inspection, Equipment } from "@/lib/types";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import {
  Eye,
  Bot,
  AlertTriangle,
  Clock3,
  CheckCircle,
  Filter,
  Download,
  Calendar,
} from "@/components/icons";
import Link from "next/link";

const statusVariant = {
  pending: "default" as const,
  processing: "info" as const,
  "quality-check": "info" as const,
  analyzing: "info" as const,
  "awaiting-evidence": "warning" as const,
  finding: "warning" as const,
  approval: "warning" as const,
  ticket: "warning" as const,
  completed: "success" as const,
  failed: "critical" as const,
};

const statusDotMap = {
  pending: "idle" as const,
  processing: "processing" as const,
  "quality-check": "processing" as const,
  analyzing: "processing" as const,
  "awaiting-evidence": "warning" as const,
  finding: "warning" as const,
  approval: "warning" as const,
  ticket: "warning" as const,
  completed: "online" as const,
  failed: "offline" as const,
};

function buildColumns(equipmentMap: Map<string, Equipment>): ColumnDef<Inspection>[] {
  return [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => (
        <code className="text-xs text-secondary-text">{row.getValue("id")}</code>
      ),
    },
    {
      accessorKey: "equipmentId",
      header: "Equipment",
      cell: ({ row }) => {
        const eq = equipmentMap.get(row.getValue("equipmentId"));
        return (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <span className="font-medium text-primary-text">
              {eq?.name || "Unknown"}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as Inspection["status"];
        return (
          <div className="flex items-center gap-2">
            <StatusDot status={statusDotMap[status]} size="sm" />
            <Badge variant={statusVariant[status]}>
              {status}
            </Badge>
          </div>
        );
      },
    },
    {
      accessorKey: "duration",
      header: "Duration",
      cell: ({ row }) => {
        const d = row.getValue("duration") as number | undefined;
        if (!d) return <span className="text-sm text-secondary-text">—</span>;
        return (
          <span className="text-sm text-secondary-text">
            {Math.floor(d / 60)}m {d % 60}s
          </span>
        );
      },
    },
    {
      accessorKey: "findings",
      header: "Findings",
      cell: ({ row }) => {
        const findings = row.getValue("findings") as string[];
        return (
          <Badge variant={findings.length >= 2 ? "warning" : findings.length >= 1 ? "info" : "success"}>
            {findings.length} findings
          </Badge>
        );
      },
    },
    {
      accessorKey: "startTime",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-sm text-secondary-text">
          {formatRelativeTime(row.getValue("startTime"))}
        </span>
      ),
    },
    {
      accessorKey: "startTime",
      header: "Completed",
      cell: ({ row }) => {
        const endTime = row.getValue("endTime") as string | undefined;
        return endTime ? (
          <span className="text-xs text-secondary-text">
            {formatDate(endTime)}
          </span>
        ) : (
          <span className="text-xs text-secondary-text">In progress</span>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const inspection = row.original;
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon-sm" asChild>
              <Link href={`/dashboard/history/${inspection.id}`}>
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </Button>
            {inspection.agentRunId && (
              <Button variant="ghost" size="icon-sm" asChild>
                <Link href={`/dashboard/agent/${inspection.agentRunId}`}>
                  <Bot className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        );
      },
    },
  ];
}

export default function HistoryPage() {
  const [filterOpen, setFilterOpen] = useState(false);
  const { data: inspections = [], isLoading: inspectionsLoading } = useInspections();
  const { data: equipment = [], isLoading: equipmentLoading } = useEquipment();

  const equipmentMap = useMemo(() => {
    const map = new Map<string, Equipment>();
    equipment.forEach((eq) => map.set(eq.id, eq));
    return map;
  }, [equipment]);

  const columns = useMemo(() => buildColumns(equipmentMap), [equipmentMap]);

  const loading = inspectionsLoading || equipmentLoading;

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display font-bold text-gradient-hero">
            Inspection History
          </h1>
          <p className="mt-1 text-secondary-text">
            Browse and review all past inspections
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Calendar className="h-4 w-4 mr-2" />
            Last 30 days
          </Button>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-primary-text">All Inspections</CardTitle>
          <p className="text-sm text-secondary-text">
            {loading ? "Loading..." : `${inspections.length} total inspections`}
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
              data={inspections}
              enableSearch
              searchKey="equipmentId"
              searchPlaceholder="Search inspections..."
              pageSize={15}
            />
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
