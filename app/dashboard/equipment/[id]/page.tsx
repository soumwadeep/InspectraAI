"use client";

import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import { SeverityIndicator } from "@/components/ui/severity-indicator";
import { DataTable } from "@/components/ui/data-table";
import { useEquipmentDetail, useFindings, useInspections } from "@/lib/hooks";
import { storageUrl } from "@/lib/api";
import { Finding, Inspection, Equipment } from "@/lib/types";
import { cn, formatDate, formatDurationMs, truncate } from "@/lib/utils";
import {
  Package,
  Edit,
  MapPin,
  Calendar,
  Tag,
  Shield,
  Clock,
  AlertTriangle,
  Eye,
  Wrench,
  ArrowLeft,
} from "@/components/icons";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

export default function EquipmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const equipmentId = params.id as string;

  const { data: equipment, isLoading: equipmentLoading } = useEquipmentDetail(equipmentId);
  const { data: allFindings = [], isLoading: findingsLoading } = useFindings();
  const { data: allInspections = [], isLoading: inspectionsLoading } = useInspections();

  const equipmentFindings = useMemo(
    () => allFindings.filter((f) => f.equipmentId === equipmentId),
    [allFindings, equipmentId]
  );
  const equipmentInspections = useMemo(
    () => allInspections.filter((i) => i.equipmentId === equipmentId),
    [allInspections, equipmentId]
  );

  const loading = equipmentLoading || findingsLoading || inspectionsLoading;

  const statusConfig = {
    operational: { label: "Operational", dot: "online" as const },
    warning: { label: "Warning", dot: "warning" as const },
    critical: { label: "Critical", dot: "offline" as const },
    maintenance: { label: "Maintenance", dot: "processing" as const },
    offline: { label: "Offline", dot: "offline" as const },
  };

  const findingColumns: ColumnDef<Finding>[] = useMemo(() => [
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
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <p className="max-w-xs text-sm text-secondary-text">
          {truncate(row.getValue("description"), 80)}
        </p>
      ),
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
        return <span className="text-sm text-secondary-text">{Math.round(c * 100)}%</span>;
      },
    },
    {
      accessorKey: "verificationStatus",
      header: "Status",
      cell: ({ row }) => {
        const s = row.getValue("verificationStatus") as string;
        return (
          <Badge variant={s === "verified" ? "success" : s === "unverified" ? "warning" : "critical"}>
            {s}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const finding = row.original;
        return (
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={`/dashboard/findings/${finding.id}`}>
              <Eye className="h-3.5 w-3.5" />
            </Link>
          </Button>
        );
      },
    },
  ], []);

  const inspectionColumns: ColumnDef<Inspection>[] = useMemo(() => [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => (
        <code className="text-xs text-secondary-text">{row.getValue("id")}</code>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.getValue("status") === "completed" ? "success" : "info"}>
          {row.getValue("status")}
        </Badge>
      ),
    },
    {
      accessorKey: "duration",
      header: "Duration",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-secondary-text tabular-nums">
          {formatDurationMs(row.getValue("duration") as number | undefined)}
        </span>
      ),
    },
    {
      accessorKey: "startTime",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-sm text-secondary-text">
          {formatDate(row.getValue("startTime"))}
        </span>
      ),
    },
  ], []);

  if (equipmentLoading && !equipment) {
    return (
      <motion.div
        className="space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-32" />
        </div>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </motion.div>
    );
  }

  if (!equipmentLoading && !equipment) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center py-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <Package className="h-12 w-12 text-secondary-text/50" />
        <p className="mt-4 text-secondary-text">Equipment not found</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/dashboard/equipment">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Equipment
          </Link>
        </Button>
      </motion.div>
    );
  }

  if (!equipment) return null;

  const status = statusConfig[equipment.status];

  const infoGrid = [
    { label: "Manufacturer", value: equipment.manufacturer || "—" },
    { label: "Model", value: equipment.model || "—" },
    { label: "Serial Number", value: equipment.serialNumber || "—" },
    { label: "Installation Date", value: equipment.installationDate || "—" },
    { label: "Inspection Schedule", value: equipment.inspectionSchedule },
    { label: "Assigned Inspector", value: equipment.assignedInspector },
  ];

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/equipment">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Equipment
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/equipment/${equipment.id}/edit`}>
            <Edit className="h-4 w-4 mr-2" />
            Edit Equipment
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Package className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-display text-primary-text">
                {equipment.name}
              </CardTitle>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-secondary-text">
                <Badge variant={equipment.status === "operational" ? "success" : equipment.status === "critical" ? "critical" : equipment.status === "warning" ? "warning" : "info"}>
                  <span className="capitalize">{equipment.status}</span>
                </Badge>
                <span className="flex items-center gap-1">
                  <Tag className="h-3 w-3" /> {equipment.category}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {equipment.location}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusDot status={status.dot} showPulse size="lg" />
            <span className="text-sm font-medium text-primary-text">
              {status.label}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-secondary-text">{equipment.description}</p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {infoGrid.map((item) => (
              <div key={item.label} className="space-y-1">
                <p className="text-xs uppercase text-secondary-text">{item.label}</p>
                <p className="font-medium text-primary-text">{item.value}</p>
              </div>
            ))}
          </div>

          {equipment.referenceImages && equipment.referenceImages.length > 0 && (
            <div className="mt-6">
              <h4 className="mb-3 text-sm font-medium text-primary-text">
                Reference images
              </h4>
              <p className="mb-3 text-xs text-secondary-text">
                Used as the alignment target for inspections of this equipment.
              </p>
              <div className="flex flex-wrap gap-3">
                {equipment.referenceImages.map((image) => (
                  <figure
                    key={image.id}
                    className="relative h-24 w-32 overflow-hidden rounded-lg border border-border bg-surface-elevated/50"
                  >
                    <img
                      src={storageUrl(image.storagePath)}
                      alt={`Reference image ${image.filename}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    <figcaption className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1 py-0.5 text-[10px] text-secondary-text">
                      {image.filename}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Findings Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-primary-text">
                Findings ({equipmentFindings.length})
              </CardTitle>
              <p className="text-sm text-secondary-text">
                All findings for this equipment
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/findings">
                View All Findings
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {findingsLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <DataTable
              columns={findingColumns}
              data={equipmentFindings}
              pageSize={10}
            />
          )}
        </CardContent>
      </Card>

      {/* Recent Inspections */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-primary-text">
                Inspection History ({equipmentInspections.length})
              </CardTitle>
              <p className="text-sm text-secondary-text">
                Past and ongoing inspections
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/history">
                View All Inspections
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {inspectionsLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <DataTable
              columns={inspectionColumns}
              data={equipmentInspections}
              pageSize={10}
            />
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
