"use client";

/**
 * One finding, and the review decision recorded against it.
 *
 * The Findings table and the equipment detail page both link here; neither route
 * existed, so both links 404'd. `GET /api/findings/{id}` already returns the row
 * with its evidence, and `POST /api/findings/{id}/review` already persists a
 * reviewer decision — the page was the only missing piece.
 *
 * The resolution states below are the values `FindingStatusEnum` actually stores
 * (hyphenated), not the Python member names. That distinction has bitten this
 * project before: writing `pending_review` produces a row that 500s on every
 * later read.
 */
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SeverityIndicator } from "@/components/ui/severity-indicator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { AlertTriangle, ArrowLeft, Bot, Eye } from "@/components/icons";
import { useFindingDetail, useReviewFinding } from "@/lib/hooks";
import { entry } from "@/lib/motion/presets";
import { formatDate } from "@/lib/utils";

/** Values of FindingStatusEnum, exactly as the column stores them. */
const RESOLUTION_STATES = [
  "pending-review",
  "confirmed",
  "rejected",
  "needs-evidence",
  "in-progress",
  "resolved",
] as const;

const VERIFICATION_LABEL: Record<string, string> = {
  unverified: "warning",
  verified: "success",
  rejected: "critical",
};

export default function FindingDetailPage() {
  const params = useParams();
  const findingId = (params.id as string) ?? "";
  const { toast } = useToast();

  const detail = useFindingDetail(findingId);
  const review = useReviewFinding();
  const [notes, setNotes] = useState("");

  const finding = detail.data;

  if (detail.isLoading && !finding) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!finding) {
    return (
      <motion.div className="flex flex-col items-center justify-center py-12" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <AlertTriangle className="h-12 w-12 text-warning/60" />
        <p className="mt-4 text-secondary-text">
          {detail.isError
            ? "The API rejected this request — the finding may belong to another organization."
            : "No finding with this id was returned."}
        </p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/dashboard/findings">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Findings
          </Link>
        </Button>
      </motion.div>
    );
  }

  function submit(resolution_state: string, verified?: boolean) {
    review.mutate(
      { finding_id: findingId, resolution_state, notes: notes.trim() || undefined, verified },
      {
        onSuccess: () => {
          toast({
            title: `Marked ${resolution_state}`,
            description: "The decision was written to the finding row.",
          });
        },
        onError: (error) => {
          toast({ title: "Review rejected", description: error.message, variant: "destructive" });
        },
      },
    );
  }

  return (
    <motion.div className="space-y-6" variants={entry.boot} initial="hidden" animate="visible">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/findings">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Findings
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-primary-text">
                {finding.category}
                <span className="ml-2 font-mono text-sm font-normal text-secondary-text">
                  {finding.id}
                </span>
              </CardTitle>
              <CardDescription className="mt-1 leading-relaxed">
                {finding.description}
              </CardDescription>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <SeverityIndicator severity={finding.severity} />
              <Badge variant={(VERIFICATION_LABEL[finding.verificationStatus] ?? "outline") as never}>
                {finding.verificationStatus}
              </Badge>
              <Badge variant={finding.resolutionState === "resolved" ? "success" : "outline"}>
                {finding.resolutionState}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Confidence" value={finding.confidence === undefined ? null : String(finding.confidence)} />
            <Field label="Detection method" value={finding.detectionMethod || null} mono />
            <Field label="Raised" value={finding.createdAt ? formatDate(finding.createdAt) : null} />
            <Field label="Assigned reviewer" value={finding.assignedReviewer ?? null} mono />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/dashboard/history/${finding.inspectionId}`}>
              <Button variant="outline" size="sm">
                <Eye className="mr-2 h-3.5 w-3.5" />
                Source inspection
              </Button>
            </Link>
            <Link href={`/dashboard/equipment/${finding.equipmentId}`}>
              <Button variant="outline" size="sm">
                Equipment record
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-primary-text">Evidence</CardTitle>
          <CardDescription>
            {finding.evidenceImages.length === 0
              ? "No evidence paths were returned on this finding row."
              : `${finding.evidenceImages.length} stored artifact path(s) referenced by this finding. The annotated images themselves are served through the inspection's authenticated evidence route.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {finding.evidenceImages.length === 0 ? (
            <p className="text-sm text-secondary-text">not returned</p>
          ) : (
            <ul className="space-y-1.5">
              {finding.evidenceImages.map((path) => (
                <li key={path}>
                  <code className="font-mono text-xs text-secondary-text">{path}</code>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-primary-text">Reviewer decision</CardTitle>
          <CardDescription>
            Writes to <code className="font-mono">POST /api/findings/{"{id}"}/review</code> and
            persists on the finding row. A human makes this call — the pipeline never
            confirms its own output.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional note recorded with the decision."
          />
          <div className="flex flex-wrap gap-2">
            {RESOLUTION_STATES.map((state) => (
              <Button
                key={state}
                size="sm"
                variant={state === finding.resolutionState ? "default" : "outline"}
                disabled={review.isPending}
                onClick={() => submit(state)}
              >
                {state}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button size="sm" variant="secondary" disabled={review.isPending} onClick={() => submit("confirmed", true)}>
              Confirm as verified
            </Button>
            <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => submit("rejected", false)}>
              Reject as false positive
            </Button>
          </div>
          {review.isPending ? <p className="text-xs text-secondary-text">writing…</p> : null}
          {finding.notes ? (
            <div className="rounded-lg border border-border bg-surface/30 p-3">
              <p className="text-kicker uppercase text-secondary-text">notes on the row</p>
              <p className="mt-1 text-sm text-primary-text">{finding.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-kicker uppercase text-secondary-text">{label}</p>
      {value === null ? (
        <p className="text-sm text-secondary-text/70">not returned</p>
      ) : (
        <p className={`truncate text-sm font-medium text-primary-text ${mono ? "font-mono text-xs" : ""}`}>
          {value}
        </p>
      )}
    </div>
  );
}
