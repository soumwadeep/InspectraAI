/**
 * Data-freshness store, kept free of React so `lib/api.ts` can write to it
 * without dragging the component tree into the HTTP client.
 *
 * The service worker tags every answer it serves from cache with
 * `x-inspectra-served-by: cache` and an age. Those headers become this state,
 * and the interface reads it to say "offline · data as of 14:32" instead of
 * presenting a stale screen as if it were live.
 */

export interface FreshnessState {
  /** Last response that came from the network rather than the cache. */
  lastSyncAt: number | null;
  /**
   * Endpoints answered from cache since the last live sync.
   *
   * A set, not a boolean. A dashboard mixes cached and uncached reads — some
   * endpoints were never visited while online, so there is nothing cached for
   * them — and a single last-write-wins flag let one fresh response hide the
   * fact that several other panels on screen were stale.
   */
  staleEndpoints: string[];
  /** Oldest recorded age among the stale endpoints, in seconds. */
  cacheAgeSeconds: number | null;
  /** Whether a service worker has taken control of this page. */
  swActive: boolean;
}

let state: FreshnessState = {
  lastSyncAt: null,
  staleEndpoints: [],
  cacheAgeSeconds: null,
  swActive: false,
};

const listeners = new Set<(state: FreshnessState) => void>();

function publish(patch: Partial<FreshnessState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

export function getFreshness(): FreshnessState {
  return state;
}

export function subscribeToFreshness(listener: (state: FreshnessState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setServiceWorkerActive(active: boolean): void {
  publish({ swActive: active });
}

/**
 * Called by the API client on every response.
 *
 * Only a network answer counts as a sync. Recording a cache hit here would make
 * "last synced" mean "last time we re-read an old response", which is the exact
 * confusion this exists to prevent.
 */
export function recordApiResponse(
  endpoint: string,
  meta: { fromCache: boolean; ageSeconds: number | null },
): void {
  if (!meta.fromCache) {
    const remaining = state.staleEndpoints.filter((name) => name !== endpoint);
    publish({
      staleEndpoints: remaining,
      cacheAgeSeconds: remaining.length ? state.cacheAgeSeconds : null,
      lastSyncAt: Date.now(),
    });
    return;
  }
  if (state.staleEndpoints.includes(endpoint)) {
    publish({ cacheAgeSeconds: meta.ageSeconds ?? state.cacheAgeSeconds });
    return;
  }
  publish({
    staleEndpoints: [...state.staleEndpoints, endpoint],
    cacheAgeSeconds: meta.ageSeconds ?? state.cacheAgeSeconds,
  });
}

/** Read the service worker's markers off a fetch Response. */
export function freshnessFromResponse(res: {
  headers: { get(name: string): string | null };
}): { fromCache: boolean; ageSeconds: number | null } {
  const fromCache = res.headers.get("x-inspectra-served-by") === "cache";
  const rawAge = res.headers.get("x-inspectra-cache-age-seconds");
  const ageSeconds = rawAge === null ? null : Number(rawAge);
  return {
    fromCache,
    ageSeconds: ageSeconds !== null && Number.isFinite(ageSeconds) ? ageSeconds : null,
  };
}

export function formatAge(seconds: number | null): string {
  if (seconds === null) return "unknown age";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}
