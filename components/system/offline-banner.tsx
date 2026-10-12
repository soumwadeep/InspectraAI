"use client";

/**
 * Connection state, stated plainly.
 *
 * Three separate facts are reported because collapsing them is how a dashboard
 * ends up lying: the browser may be connected while the API is not reachable,
 * and data on screen may be a cached copy that is twenty minutes old. An
 * inspection tool that shows a stale finding count as if it were current is
 * worse than one that shows nothing.
 *
 * It also says what cannot be done offline, so nobody uploads a capture to a
 * dead connection and believes it was taken.
 */
import { WifiOff, Clock3 } from "@/components/icons";
import { formatAge, useOffline } from "@/lib/offline";
import { entry } from "@/lib/motion/presets";
import { motion } from "framer-motion";

export function OfflineBanner() {
  const { browserOnline, staleEndpoints, cacheAgeSeconds, lastSyncAt, swActive } = useOffline();

  const usingCache = staleEndpoints.length > 0;

  // Nothing to say while connected and every panel answered live.
  if (browserOnline && !usingCache) return null;

  const offline = !browserOnline;
  const ageText = usingCache
    ? formatAge(cacheAgeSeconds)
    : lastSyncAt
      ? formatAge(Math.round((Date.now() - lastSyncAt) / 1000))
      : null;

  return (
    <motion.div
      role="status"
      aria-live="polite"
      variants={entry.rise}
      initial="hidden"
      animate="visible"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-xs ${
        offline
          ? "border-warning/40 bg-warning/10 text-warning"
          : "border-border bg-surface/60 text-secondary-text"
      }`}
    >
      <span className="flex items-center gap-2 font-semibold">
        <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {offline ? "Offline" : "Showing cached data"}
      </span>

      {ageText && (
        <span className="flex items-center gap-1.5">
          <Clock3 className="h-3 w-3 shrink-0" aria-hidden />
          <span className="telemetry">
            {offline ? "data as of" : "served from cache,"} {ageText} ago
          </span>
        </span>
      )}

      {/* Naming the count, not just the state, so an operator knows how much of
          what they are looking at is old. */}
      {usingCache && (
        <span className="telemetry text-[10px]">
          {staleEndpoints.length} endpoint{staleEndpoints.length === 1 ? "" : "s"} cached
        </span>
      )}

      <span className="text-secondary-text/80">
        {offline
          ? "Reads are the last ones taken while connected. Uploading a capture, running an inspection and saving a decision all need the API."
          : "Some panels were answered from the local cache rather than the database. The rest are live."}
      </span>

      {!swActive && (
        <span className="telemetry text-[10px] text-secondary-text/60">
          no service worker — nothing was cached for offline use
        </span>
      )}
    </motion.div>
  );
}
