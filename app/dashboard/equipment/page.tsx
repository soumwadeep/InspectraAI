"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { DataTable } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { useEquipment } from "@/lib/hooks";
import { ColumnDef } from "@tanstack/react-table";
import { Equipment } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  Plus,
  Eye,
  Edit,
  Package,
  MapPin,
} from "@/components/icons";
import Link from "next/link";

const equipmentStatusVariant = {
  operational: "success" as const,
  warning: "warning" as const,
  critical: "critical" as const,
  maintenance: "info" as const,
  offline: "default" as const,
} as const;

const columns: ColumnDef<Equipment>[] = [
  {
    accessorKey: "name",
    header: "Equipment",
    cell: ({ row }) => {
      const eq = row.original;
      return (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Package className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="font-medium text-primary-text">{eq.name}</div>
            <div className="text-sm text-secondary-text">
              {eq.serialNumber || eq.manufacturer}
            </div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "category",
    header: "Category",
    cell: ({ row }) => (
      <div className="text-secondary-text">{row.getValue("category")}</div>
    ),
  },
  {
    accessorKey: "location",
    header: "Location",
    cell: ({ row }) => (
      <div className="flex items-center gap-1 text-secondary-text">
        <MapPin className="h-3 w-3" />
        {row.getValue("location")}
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as Equipment["status"];
      return (
        <div className="flex items-center gap-2">
          <StatusDot status={status === "operational" ? "online" : status === "maintenance" ? "processing" : status === "offline" ? "offline" : "warning"} showPulse={status === "operational"} />
          <span className="text-sm font-medium capitalize text-primary-text">
            {status}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "openFindings",
    header: "Findings",
    cell: ({ row }) => {
      const count = row.getValue("openFindings") as number;
      return (
        <Badge variant={count >= 3 ? "critical" : count >= 1 ? "warning" : "success"}>
          {count} open
        </Badge>
      );
    },
  },
  {
    accessorKey: "lastInspection",
    header: "Last Inspection",
    cell: ({ row }) => {
      const date = row.getValue("lastInspection") as string | undefined;
      return (
        <span className="text-sm text-secondary-text">
          {date ? formatRelativeTime(date) : "—"}
        </span>
      );
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const eq = row.original;
      return (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={`/dashboard/equipment/${eq.id}`}>
              <Eye className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={`/dashboard/equipment/${eq.id}/edit`}>
              <Edit className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      );
    },
  },
];

export default function EquipmentPage() {
  const { data: equipment, isLoading } = useEquipment();

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display font-bold text-gradient-hero">
            Equipment
          </h1>
          <p className="mt-1 text-secondary-text">
            Manage and monitor all registered industrial equipment
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/equipment/new">
            <Plus className="h-5 w-5 mr-2" />
            Add Equipment
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-primary-text">All Equipment</CardTitle>
          <p className="text-sm text-secondary-text">
            {isLoading ? "Loading..." : `${equipment?.length ?? 0} total equipment registered`}
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={equipment ?? []}
              enableSearch
              searchKey="name"
              searchPlaceholder="Search equipment..."
              pageSize={15}
            />
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
