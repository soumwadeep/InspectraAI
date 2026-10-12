"use client";

/**
 * React binding for the freshness store, plus service worker registration.
 *
 * The state itself lives in lib/freshness.ts so the HTTP client can write to it
 * without importing the component tree.
 */
import { createContext, useContext, useEffect, useState } from "react";

import {
  getFreshness,
  setServiceWorkerActive,
  subscribeToFreshness,
  type FreshnessState,
} from "@/lib/freshness";

export type { FreshnessState };
export { formatAge } from "@/lib/freshness";

const OfflineContext = createContext<FreshnessState>(getFreshness());

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<FreshnessState>(getFreshness());

  useEffect(() => {
    // Responses arrive in bursts on a dashboard running a dozen queries;
    // coalesce them into one update rather than one render per response. A timer
    // not requestAnimationFrame, so state stays correct in a background tab.
    let timer = 0;
    let latest = getFreshness();
    const unsubscribe = subscribeToFreshness((next) => {
      latest = next;
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        setSnapshot(latest);
      }, 0);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // Production only. A service worker in `next dev` caches the first build it
    // sees and makes every later edit invisible, which is a bad trade on a
    // development machine — and would make this session's own verification
    // untrustworthy.
    if (process.env.NODE_ENV !== "production") return;

    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        if (!cancelled) setServiceWorkerActive(true);
      })
      .catch(() => {
        // Blocked storage or an insecure origin. The app is simply online-only,
        // and the banner reflects that rather than claiming offline support.
        if (!cancelled) setServiceWorkerActive(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <OfflineContext.Provider value={snapshot}>{children}</OfflineContext.Provider>;
}

export function useOffline(): FreshnessState & { browserOnline: boolean } {
  const state = useContext(OfflineContext);
  const [browserOnline, setBrowserOnline] = useState(true);

  useEffect(() => {
    // navigator.onLine means "not disconnected", not "the server answered".
    // Reported separately from staleEndpoints: the browser can be connected while the
    // API is down, and connected does not mean the numbers on screen are live.
    const update = () => setBrowserOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return { ...state, browserOnline };
}
