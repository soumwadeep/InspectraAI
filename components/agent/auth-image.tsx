"use client";

/**
 * Evidence bytes come from `GET /api/findings/{id}/evidence/{eid}`, which demands
 * an Authorization header — and an `<img>` element cannot send one. `fetchBlobUrl`
 * in lib/api.ts exists for exactly this, so finding evidence goes through it
 * rather than a bare `src`. `next/image` is not an option either: blob URLs cannot
 * be optimized and the API origin is not in `remotePatterns`.
 *
 * A step's `evidence_ref` is the other case: a stored path with no finding to hang
 * an auth-protected route on, so it is read from the backend's `/storage` mount
 * with `storageUrl()` — the same pairing the upload page uses for reference images.
 */
import { useEffect, useState } from "react";

import { fetchBlobUrl, storageUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

/* eslint-disable @next/next/no-img-element */

type LoadState = "loading" | "ready" | "failed";

interface AuthImageProps {
  /**
   * Path appended to the API base and fetched with the bearer token, e.g.
   * `/api/findings/f_1/evidence/e_1`.
   */
  apiPath?: string;
  /**
   * Storage path from a step's `evidence_ref`, loaded from the unauthenticated
   * `/storage` mount. Kept separate so the UI can name the route the bytes came
   * from instead of blurring the two.
   */
  storagePath?: string;
  alt: string;
  className?: string;
  /** Frame the image reserves while bytes are in flight. */
  frameClassName?: string;
}

export function AuthImage({
  apiPath,
  storagePath,
  alt,
  className,
  frameClassName,
}: AuthImageProps) {
  const [state, setState] = useState<LoadState>("loading");
  const [url, setUrl] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!apiPath) {
      setUrl(null);
      setState("loading");
      setFailure(null);
      return;
    }

    let cancelled = false;
    setState("loading");
    setFailure(null);

    fetchBlobUrl(apiPath)
      .then((objectUrl) => {
        if (cancelled) return;
        setUrl(objectUrl);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFailure(error instanceof Error ? error.message : "the request was rejected");
        setState("failed");
      });

    return () => {
      cancelled = true;
    };
    // `apiPath` is a stable string built from returned ids.
  }, [apiPath]);

  const directSrc = !apiPath && storagePath ? storageUrl(storagePath) : null;

  if (directSrc) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border border-border bg-surface/40",
          frameClassName,
        )}
      >
        <img
          src={directSrc}
          alt={alt}
          className={cn("block h-auto w-full", className)}
          loading="lazy"
          decoding="async"
          onError={() => {
            setState("failed");
            setFailure("no bytes at the stored path");
          }}
        />
        {state === "failed" && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/85 p-3">
            <p className="telemetry text-center text-[11px] text-warning">
              {failure ?? "file missing"}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-surface/40",
        frameClassName,
      )}
    >
      {state === "ready" && url && (
        <img
          src={url}
          alt={alt}
          className={cn("block h-auto w-full", className)}
          loading="lazy"
          decoding="async"
        />
      )}
      {state === "loading" && (
        <div className="flex min-h-28 items-center justify-center p-4">
          <p className="telemetry text-[11px] text-secondary-text">loading bytes…</p>
        </div>
      )}
      {state === "failed" && (
        <div className="flex min-h-28 flex-col justify-center gap-1 p-4">
          <p className="text-xs font-medium text-warning">Image not available</p>
          <p className="telemetry text-[11px] text-secondary-text">
            {failure ?? "the API returned no bytes"}
          </p>
        </div>
      )}
      {apiPath && state === "ready" && (
        <span className="pointer-events-none absolute right-1 top-1 rounded bg-surface/80 px-1 py-0.5 telemetry text-[9px] text-secondary-text">
          auth endpoint
        </span>
      )}
    </div>
  );
}

