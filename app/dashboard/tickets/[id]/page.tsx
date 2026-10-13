"use client";

/**
 * One maintenance ticket, with its approval and status history.
 *
 * `GET /api/tickets/{id}` returns { ticket, events, approvals, verifications }.
 * The tickets table has linked here since the first commit; the route did not
 * exist, so the link 404'd.
 *
 * The transition buttons below mirror `TICKET_TRANSITIONS` in
 * backend/app/models/ticket.py. That is deliberate duplication rather than a
 * server-driven capability list, because no endpoint exposes the table — so the
 * UI offers only moves the backend will accept, and the server still rejects
 * anything else with 409. If the two ever disagree, the server wins.
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import { useToast } from "@/components/ui/use-toast";
import { AlertTriangle, ArrowLeft, CheckCircle, Clock3 } from "@/components/icons";
import { useTicketDetail, useUpdateTicket } from "@/lib/hooks";
import { entry } from "@/lib/motion/presets";
import { formatDate, formatRelativeTime } from "@/lib/utils";

/** Mirrors TICKET_TRANSITIONS in backend/app/models/ticket.py. */
const TRANSITIONS: Record<string, string[]> = {
  draft: ["awaiting-approval"],
  "awaiting-approval": ["open", "draft"],
  open: ["assigned"],
  assigned: ["in-progress"],
  "in-progress": ["awaiting-verification"],
  "awaiting-verification": ["closed", "reopened"],
  reopened: ["in-progress"],
  closed: [],
};

const TRANSITION_LABEL: Record<string, string> = {
  "awaiting-approval": "Send for approval",
  open: "Approve — open the ticket",
  draft: "Reject back to draft",
  assigned: "Assign to an operator",
  "in-progress": "Start work",
  "awaiting-verification": "Submit for verification",
  closed: "Close — verification passed",
  reopened: "Reopen — verification failed",
};

const PRIORITY_TONE: Record<string, "success" | "info" | "warning" | "critical"> = {
  low: "info",
  medium: "info",
  high: "warning",
  critical: "critical",
};

export default function TicketDetailPage() {
  const params = useParams();
  const ticketId = (params.id as string) ?? "";
  const { toast } = useToast();
  const detail = useTicketDetail(ticketId);
  const update = useUpdateTicket();

  const raw = (detail.data ?? null) as Record<string, unknown> | null;
  const ticket = (raw?.ticket ?? null) as Record<string, unknown> | null;

  const events = Array.isArray(raw?.events) ? (raw!.events as Record<string, unknown>[]) : [];
  const approvals = Array.isArray(raw?.approvals) ? (raw!.approvals as Record<string, unknown>[]) : [];
  const verifications = Array.isArray(raw?.verifications)
    ? (raw!.verifications as Record<string, unknown>[])
    : [];

  if (detail.isLoading && !ticket) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <motion.div className="flex flex-col items-center justify-center py-12" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <AlertTriangle className="h-12 w-12 text-warning/60" />
        <p className="mt-4 text-secondary-text">
          {detail.isError
            ? "The API rejected this request — the ticket may belong to another organization."
            : "No ticket with this id was returned."}
        </p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/dashboard/tickets">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Maintenance Tickets
          </Link>
        </Button>
      </motion.div>
    );
  }

  const status = String(ticket.status ?? "unknown");
  const allowed = TRANSITIONS[status] ?? [];
  const priority = String(ticket.priority ?? "unknown");
  const dueDate = ticket.due_date ? new Date(String(ticket.due_date)) : null;
  const overdue =
    dueDate !== null && dueDate.getTime() < Date.now() && status !== "closed";

  function move(to: string) {
    update.mutate(
      { ticket_id: ticketId, data: { status: to } },
      {
        onSuccess: () => toast({ title: `Ticket moved to ${to}`, description: "Status change and its event row were persisted." }),
        onError: (error) => toast({ title: "Transition refused", description: error.message, variant: "destructive" }),
      },
    );
  }

  return (
    <motion.div className="space-y-6" variants={entry.boot} initial="hidden" animate="visible">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/tickets">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Maintenance Tickets
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-primary-text">Maintenance ticket</CardTitle>
              <CardDescription>
                <code className="font-mono text-xs">{ticket.id as string}</code>
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusDot
                status={status === "closed" ? "online" : status === "reopened" ? "warning" : "processing"}
                showPulse={status === "in-progress"}
              />
              <Badge variant={status === "closed" ? "success" : "info"}>{status}</Badge>
              <Badge variant={PRIORITY_TONE[priority] ?? "outline"}>{priority}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm leading-relaxed text-secondary-text">
            {String(ticket.description ?? "not returned")}
          </p>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Raised" value={ticket.created_at ? formatDate(String(ticket.created_at)) : null} />
            <Field label="Last updated" value={ticket.updated_at ? formatRelativeTime(String(ticket.updated_at)) : null} />
            <Field
              label="Due"
              value={dueDate ? formatDate(String(ticket.due_date)) : null}
              tone={overdue ? "text-critical-text" : undefined}
              hint={overdue ? "overdue" : undefined}
            />
            <Field
              label="Assigned operator"
              value={ticket.assigned_operator_id ? String(ticket.assigned_operator_id) : null}
              mono
              hint={ticket.assigned_operator_id ? "id only — no member-listing endpoint exists" : undefined}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {typeof ticket.finding_id === "string" && ticket.finding_id ? (
              <Link href={`/dashboard/findings/${ticket.finding_id}`}>
                <Button variant="outline" size="sm">
                  Source finding
                </Button>
              </Link>
            ) : null}
            {typeof ticket.equipment_id === "string" && ticket.equipment_id ? (
              <Link href={`/dashboard/equipment/${ticket.equipment_id}`}>
                <Button variant="outline" size="sm">
                  Equipment record
                </Button>
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-primary-text">Move this ticket</CardTitle>
          <CardDescription>
            {allowed.length === 0
              ? status === "closed"
                ? "`closed` is terminal. A new finding opens a new ticket rather than reviving this one, so the history stays auditable."
                : "The transition table allows no move from this status."
              : "Only transitions the backend's TICKET_TRANSITIONS table permits from the current status."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allowed.length === 0 ? (
            <p className="text-sm text-secondary-text">No actions available.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allowed.map((to) => (
                <Button
                  key={to}
                  size="sm"
                  variant={to === "closed" ? "default" : to === "reopened" || to === "draft" ? "destructive" : "outline"}
                  disabled={update.isPending}
                  onClick={() => move(to)}
                >
                  {TRANSITION_LABEL[to] ?? to}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Status history ({events.length})</CardTitle>
            <CardDescription>
              One row per transition, written by the API — not reconstructed here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-secondary-text">No status events recorded.</p>
            ) : (
              <ol className="space-y-3">
                {events.map((event, index) => (
                  <li key={String(event.id ?? index)} className="flex items-start gap-3">
                    <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-secondary-text" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-primary-text">
                        {String(event.status ?? "not returned")}
                      </p>
                      <p className="text-xs text-secondary-text">
                        {event.created_at ? formatRelativeTime(String(event.created_at)) : "not returned"}
                        {event.actor_id ? ` · actor ${String(event.actor_id).slice(0, 8)}` : ""}
                      </p>
                      {event.notes ? (
                        <p className="mt-1 text-xs text-secondary-text">{String(event.notes)}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-primary-text">Approvals ({approvals.length})</CardTitle>
            <CardDescription>
              Explicit human decisions on this ticket.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {approvals.length === 0 ? (
              <p className="text-sm text-secondary-text">No approval recorded yet.</p>
            ) : (
              <ul className="space-y-3">
                {approvals.map((approval, index) => (
                  <li key={String(approval.id ?? index)} className="flex items-start gap-3">
                    <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium capitalize text-primary-text">
                        {String(approval.status ?? "not returned")}
                      </p>
                      <p className="text-xs text-secondary-text">
                        {approval.created_at ? formatRelativeTime(String(approval.created_at)) : "not returned"}
                      </p>
                      {approval.reason ? (
                        <p className="mt-1 text-xs text-secondary-text">{String(approval.reason)}</p>
                      ) : null}
                      {approval.approver_id ? (
                        <p className="mt-0.5 text-[10px] text-secondary-text/80">
                          approver {String(approval.approver_id).slice(0, 8)}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-primary-text">Repair verification ({verifications.length})</CardTitle>
          <CardDescription>
            A ticket only closes on a passed verification. Absence here means the work
            has not been checked, not that it failed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {verifications.length === 0 ? (
            <p className="text-sm text-secondary-text">
              No verification records exist for this ticket.
            </p>
          ) : (
            <ul className="space-y-2">
              {verifications.map((row, index) => (
                <li key={String(row.id ?? index)} className="text-sm text-primary-text">
                  {String(row.status ?? row.result ?? "not returned")}
                  {row.created_at ? (
                    <span className="ml-2 text-xs text-secondary-text">
                      {formatRelativeTime(String(row.created_at))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {ticket.completion_notes ? (
            <div className="mt-4 rounded-lg border border-border bg-surface/30 p-3">
              <p className="text-kicker uppercase text-secondary-text">completion notes</p>
              <p className="mt-1 text-sm text-primary-text">{String(ticket.completion_notes)}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function Field({
  label,
  value,
  mono,
  tone,
  hint,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-kicker uppercase text-secondary-text">{label}</p>
      {value === null ? (
        <p className="text-sm text-secondary-text/70">not returned</p>
      ) : (
        <p className={`truncate text-sm font-medium ${tone ?? "text-primary-text"} ${mono ? "font-mono text-xs" : ""}`}>
          {value}
        </p>
      )}
      {hint ? <p className="text-[10px] text-secondary-text/80">{hint}</p> : null}
    </div>
  );
}
