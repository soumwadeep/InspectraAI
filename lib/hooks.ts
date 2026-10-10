"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, AnalyticsOverview } from "./api";
import { Equipment, Finding, MaintenanceTicket, Inspection, AgentRun, BenchmarkRun } from "./types";

// ---- Equipment hooks ----

export function useEquipment(params?: {
  search?: string;
  status?: string;
  category?: string;
  limit?: number;
}) {
  return useQuery<Equipment[], Error>({
    queryKey: ["equipment", params],
    queryFn: () => api.equipment.list(params),
    staleTime: 30 * 1000,
  });
}

export function useEquipmentDetail(id: string) {
  return useQuery<Equipment, Error>({
    queryKey: ["equipment", id],
    queryFn: () => api.equipment.get(id),
    staleTime: 30 * 1000,
  });
}

export function useEquipmentStatus(id: string) {
  return useQuery<Record<string, unknown>, Error>({
    queryKey: ["equipment-status", id],
    queryFn: () => api.equipment.status(id),
    staleTime: 30 * 1000,
  });
}

// ---- Findings hooks ----

export function useFindings(params?: {
  status?: string;
  severity?: string;
  equipment_id?: string;
}) {
  return useQuery<Finding[], Error>({
    queryKey: ["findings", params],
    queryFn: () => api.findings.list(params),
    staleTime: 30 * 1000,
  });
}

export function useFindingDetail(id: string) {
  return useQuery<Finding, Error>({
    queryKey: ["finding", id],
    queryFn: () => api.findings.get(id),
    enabled: !!id,
  });
}

export function useReviewFinding() {
  const queryClient = useQueryClient();
  return useMutation<Finding, Error, {
    finding_id: string;
    resolution_state: string;
    notes?: string;
    verified?: boolean;
  }>({
    mutationFn: (data) =>
      api.findings.review(data.finding_id, data.resolution_state, data.notes, data.verified),
    onSuccess: (updated) => {
      queryClient.setQueryData(["finding", updated.id], updated);
      queryClient.invalidateQueries({ queryKey: ["findings"] });
    },
  });
}

// ---- Inspections hooks ----

export function useInspections(status?: string) {
  return useQuery<Inspection[], Error>({
    queryKey: ["inspections", status],
    queryFn: () => api.inspections.list(status),
    staleTime: 30 * 1000,
  });
}

export function useInspectionDetail(id: string) {
  return useQuery<Record<string, unknown>, Error>({
    queryKey: ["inspection", id],
    queryFn: () => api.inspections.get(id),
    enabled: !!id,
  });
}

// ---- Tickets hooks ----

export function useTickets(params?: { status?: string; priority?: string }) {
  return useQuery<MaintenanceTicket[], Error>({
    queryKey: ["tickets", params],
    queryFn: () => api.tickets.list(params),
    staleTime: 30 * 1000,
  });
}

export function useTicketDetail(id: string) {
  return useQuery<Record<string, unknown>, Error>({
    queryKey: ["ticket", id],
    queryFn: () => api.tickets.get(id),
    enabled: !!id,
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();
  return useMutation<MaintenanceTicket, Error, {
    ticket_id: string;
    data: {
      status?: string;
      assigned_operator_id?: string;
      priority?: string;
      completion_notes?: string;
      due_date?: string | null;
    };
  }>({
    mutationFn: ({ ticket_id, data }) => api.tickets.update(ticket_id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(["ticket", updated.id], updated);
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

// ---- Agent runs hooks ----

export function useAgentRuns() {
  return useQuery<AgentRun[], Error>({
    queryKey: ["agent-runs"],
    queryFn: () => api.agent.listRuns(),
    staleTime: 30 * 1000,
  });
}

export function useAgentRun(id: string) {
  return useQuery<AgentRun, Error>({
    queryKey: ["agent-run", id],
    queryFn: () => api.agent.getRun(id),
    enabled: !!id,
  });
}

// ---- Benchmarks hooks ----

export function useBenchmarks(params?: { limit?: number }) {
  return useQuery<BenchmarkRun[], Error>({
    queryKey: ["benchmarks", params],
    queryFn: () => api.benchmarks.list(params),
    staleTime: 60 * 1000,
  });
}

export function useBenchmark(id: string) {
  return useQuery<BenchmarkRun, Error>({
    queryKey: ["benchmark", id],
    queryFn: () => api.benchmarks.get(id),
    enabled: !!id,
  });
}

// ---- Analytics hooks ----

export function useAnalyticsOverview(days: number = 30) {
  return useQuery<AnalyticsOverview, Error>({
    queryKey: ["analytics-overview", days],
    queryFn: () => api.analytics.overview(days),
    staleTime: 60 * 1000,
  });
}
