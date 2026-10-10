"use client";

import { motion } from "framer-motion";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/ui/data-table";
import { StatusDot } from "@/components/ui/status-dot";
import { useTickets, useEquipment } from "@/lib/hooks";
import { MaintenanceTicket, Equipment } from "@/lib/types";
import { cn, formatDate, formatRelativeTime, truncate } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import {
  Wrench,
  Plus,
  Eye,
  CheckCircle,
  Clock3,
  XCircle,
  Filter,
  Download,
  AlertTriangle,
} from "@/components/icons";
import Link from "next/link";

const statusVariant = {
  draft: "default" as const,
  "awaiting-approval": "warning" as const,
  open: "info" as const,
  assigned: "info" as const,
  "in-progress": "info" as const,
  "awaiting-verification": "warning" as const,
  closed: "success" as const,
  reopened: "critical" as const,
};

const priorityVariant = {
  low: "default" as const,
  medium: "info" as const,
  high: "warning" as const,
  critical: "critical" as const,
};

const statusDotMap = {
  draft: "idle" as const,
  "awaiting-approval": "warning" as const,
  open: "processing" as const,
  assigned: "processing" as const,
  "in-progress": "processing" as const,
  "awaiting-verification": "warning" as const,
  closed: "online" as const,
  reopened: "offline" as const,
};

function buildColumns(equipmentMap: Map<string, Equipment>): ColumnDef<MaintenanceTicket>[] {
  return [
    {
      accessorKey: "id",
      header: "Ticket ID",
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
            <Wrench className="h-4 w-4 text-secondary-text" />
            <span className="font-medium text-primary-text">
              {eq?.name || "Unknown"}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "priority",
      header: "Priority",
      cell: ({ row }) => (
        <Badge variant={priorityVariant[row.getValue("priority")]}>
          {row.getValue("priority")}
        </Badge>
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
      accessorKey: "assignedOperator",
      header: "Assignee",
      cell: ({ row }) => (
        <span className="text-sm text-secondary-text">
          {row.getValue("assignedOperator") || "Unassigned"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as MaintenanceTicket["status"];
        return (
          <div className="flex items-center gap-2">
            <StatusDot status={statusDotMap[status]} size="sm" showPulse={status === "in-progress" || status === "open" || status === "assigned"} />
            <Badge variant={statusVariant[status]}>
              {status.replace(/-/g, " ")}
            </Badge>
          </div>
        );
      },
    },
    {
      accessorKey: "dueDate",
      header: "Due Date",
      cell: ({ row }) => {
        const dd = row.getValue("dueDate") as string | undefined;
        if (!dd) return <span className="text-sm text-secondary-text">—</span>;
        const overdue = new Date(dd) < new Date();
        return (
          <span className={cn("text-sm", overdue ? "text-critical" : "text-secondary-text")}>
            {formatDate(dd)}
          </span>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const ticket = row.original;
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon-sm" asChild>
              <Link href={`/dashboard/tickets/${ticket.id}`}>
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        );
      },
    },
  ];
}

export default function TicketsPage() {
  const { data: tickets = [], isLoading: ticketsLoading } = useTickets();
  const { data: equipment = [], isLoading: equipmentLoading } = useEquipment();

  const equipmentMap = useMemo(() => {
    const map = new Map<string, Equipment>();
    equipment.forEach((eq) => map.set(eq.id, eq));
    return map;
  }, [equipment]);

  const columns = useMemo(() => buildColumns(equipmentMap), [equipmentMap]);

  const loading = ticketsLoading || equipmentLoading;

  const openCount = tickets.filter((t) => t.status === "open" || t.status === "in-progress").length;
  const awaitingApproval = tickets.filter((t) => t.status === "awaiting-approval").length;
  const closedCount = tickets.filter((t) => t.status === "closed").length;
  const criticalCount = tickets.filter((t) => t.priority === "critical").length;

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display font-bold text-gradient-hero">
            Maintenance Tickets
          </h1>
          <p className="mt-1 text-secondary-text">
            Manage maintenance workflows and approval processes
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/dashboard/tickets/new">
              <Plus className="h-5 w-5 mr-2" />
              New Ticket
            </Link>
          </Button>
          <Button variant="outline" size="sm">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-critical">{criticalCount}</div>
              <p className="text-sm text-secondary-text">Critical Priority</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-warning">{openCount}</div>
              <p className="text-sm text-secondary-text">Open / In Progress</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-info">{awaitingApproval}</div>
              <p className="text-sm text-secondary-text">Awaiting Approval</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-success">{closedCount}</div>
              <p className="text-sm text-secondary-text">Closed</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-primary-text">All Tickets</CardTitle>
          <p className="text-sm text-secondary-text">
            {loading ? "Loading..." : `${tickets.length} total tickets`}
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
              data={tickets}
              enableSearch
              searchKey="id"
              searchPlaceholder="Search tickets..."
              pageSize={15}
            />
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
