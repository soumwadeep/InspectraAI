"use client";

import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle, XCircle } from "@/components/icons";

function Bool({ value }: { value: boolean }) {
  return value ? (
    <span className="flex items-center gap-1 text-success">
      <CheckCircle className="h-3.5 w-3.5" />
      yes
    </span>
  ) : (
    <span className="flex items-center gap-1 text-secondary-text">
      <XCircle className="h-3.5 w-3.5" />
      no
    </span>
  );
}

/**
 * Runtime introspection from `GET /api/system/capabilities`.
 *
 * Everything here is the API's own answer about what this deployment can do —
 * the point is that unimplemented capabilities (AWS worker, COOL, queue depth
 * instrumentation, real-world accuracy claims) are shown as absent rather than
 * decorated.
 */
export function CapabilitiesPanel({ className }: { className?: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["system-capabilities"],
    queryFn: () => api.system.capabilities(),
    staleTime: 60 * 1000,
  });

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-primary-text">Runtime capabilities</CardTitle>
        <CardDescription>
          Self-reported by the live API process at{" "}
          <code className="font-mono">GET /api/system/capabilities</code> — configuration and
          introspection, not benchmark results.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : error ? (
          <div className="flex items-start gap-2 rounded-lg bg-critical/10 p-3 text-sm text-critical">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <code className="font-mono">GET /api/system/capabilities</code> failed
              {error instanceof ApiError ? ` (HTTP ${error.status})` : ""}: {error.message}
            </p>
          </div>
        ) : data ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-surface/30 p-3">
                <p className="text-kicker uppercase text-secondary-text">OpenCV</p>
                <p className="telemetry mt-1 text-primary-text">
                  version {data.opencv.version}
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-secondary-text">
                  <li className="flex justify-between gap-2">
                    <span>FFMPEG backend</span>
                    <Bool value={data.opencv.ffmpeg} />
                  </li>
                  <li className="flex justify-between gap-2">
                    <span>GStreamer backend</span>
                    <Bool value={data.opencv.gstreamer} />
                  </li>
                  <li className="flex justify-between gap-2">
                    <span>contrib modules</span>
                    <Bool value={data.opencv.contrib_available} />
                  </li>
                </ul>
                <p className="mt-1 text-xs text-secondary-text">{data.opencv.note}</p>
              </div>
              <div className="rounded-lg bg-surface/30 p-3">
                <p className="text-kicker uppercase text-secondary-text">Database &amp; queue</p>
                <ul className="mt-1 space-y-0.5 text-xs text-secondary-text">
                  <li className="flex justify-between gap-2">
                    <span>Dialect</span>
                    <span className="telemetry text-primary-text">{data.database.dialect}</span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span>Tables present</span>
                    <span className="telemetry text-primary-text">
                      {data.database.tables_present}
                    </span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span>Postgres verified</span>
                    <Bool value={data.database.postgres_verified} />
                  </li>
                  <li className="flex justify-between gap-2">
                    <span>Queue instrumented</span>
                    <Bool value={data.queue.instrumented} />
                  </li>
                </ul>
                <p className="mt-1 text-xs text-secondary-text">{data.queue.note}</p>
              </div>
            </div>

            <div className="rounded-lg bg-surface/30 p-3">
              <p className="text-kicker uppercase text-secondary-text">Integrations</p>
              <ul className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-secondary-text sm:grid-cols-4">
                <li className="flex justify-between gap-2">
                  <span>Redis</span>
                  <Bool value={data.integrations.redis_configured} />
                </li>
                <li className="flex justify-between gap-2">
                  <span>S3</span>
                  <Bool value={data.integrations.s3_configured} />
                </li>
                <li className="flex justify-between gap-2">
                  <span>AWS worker</span>
                  <Bool value={data.integrations.aws_worker} />
                </li>
                <li className="flex justify-between gap-2">
                  <span>COOL</span>
                  <Bool value={data.integrations.cool_integration} />
                </li>
              </ul>
            </div>

            <div>
              <p className="text-kicker uppercase text-secondary-text">Feature state</p>
              <ul className="mt-2 space-y-1.5">
                {data.features.map((feature) => (
                  <li
                    key={feature.name}
                    className="flex items-start justify-between gap-3 rounded-lg bg-surface/20 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-primary-text">{feature.name}</p>
                      <p className="text-xs text-secondary-text">{feature.detail}</p>
                    </div>
                    <span
                      className={
                        feature.implemented
                          ? "shrink-0 text-xs font-medium text-success"
                          : "shrink-0 text-xs font-medium text-warning"
                      }
                    >
                      {feature.implemented ? "implemented" : "not implemented"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-sm text-warning">
            The request answered without a capabilities payload, so there is nothing to report.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
