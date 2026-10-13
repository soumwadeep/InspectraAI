"use client";

/**
 * UI language switching backed by BHASHINI machine translation.
 *
 * How it works: rather than extracting every string in the app into a
 * dictionary, this translates the text nodes the browser has already rendered,
 * which is how in-page translators work. The English source of each node is
 * remembered in a WeakMap so switching back restores it exactly, and every
 * result is persisted to localStorage — so a second visit, or a visit with no
 * network at all, paints from cache without a request.
 *
 * What it deliberately refuses to translate matters more than what it
 * translates. This application's claim is that the numbers on screen were
 * measured, so a translator that rewrote `blur=1529.0`, `GET /api/agent/runs`,
 * an evidence path or a run id would corrupt the audit trail it is decorating.
 * `shouldTranslate` is therefore a deny-list by default: numbers, units,
 * code, telemetry rows, endpoint names, identifiers and key=value measurements
 * are all left exactly as the API wrote them.
 *
 * A React re-render puts the English text back on a node. The MutationObserver
 * notices and re-applies from cache, which is why the second language change is
 * near-instant and why offline keeps working.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { api } from "@/lib/api";
import type { TranslateLanguages } from "@/lib/types";

const LOCALE_KEY = "inspectra.locale";
const CACHE_KEY = "inspectra.translations.v1";
const BATCH_SIZE = 60;
export const SOURCE_LOCALE = "en";

type Cache = Record<string, Record<string, string>>;

export type TranslationStatus =
  | "source" /* English, nothing to do */
  | "loading" /* a request is in flight */
  | "ready" /* target applied */
  | "cached" /* target applied from localStorage, no network used */
  | "unavailable"; /* server declined or is unreachable */

interface LanguageContextValue {
  locale: string;
  available: TranslateLanguages | null;
  status: TranslationStatus;
  /** Strings resolved so far in this session, per locale. */
  coverage: Record<string, number>;
  setLocale: (locale: string) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useI18n(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useI18n must be used within LanguageProvider");
  return context;
}

function readCache(): Cache {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Cache) : {};
  } catch {
    // Corrupt or quota-truncated JSON: start clean rather than throw on every
    // render. The next successful batch rewrites the key.
    return {};
  }
}

function writeCache(cache: Cache): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Private mode or a full quota. Translation still works for this page view;
    // it just cannot be replayed offline.
  }
}

/**
 * Should this exact piece of text be translated?
 *
 * Defaults to no. Anything that looks like data rather than prose is left
 * untouched, because a mangled measurement is worse than an untranslated label.
 */
export function shouldTranslate(raw: string): boolean {
  const text = raw.trim();
  if (text.length < 2) return false;
  // Numbers, units and separators only: "18", "261 ms", "0.886", "99.7%", "—".
  if (/^[\d\s.,:%/\-+–—=<>~°#*()[\]{}|]+$/.test(text)) return false;
  // Endpoint names and HTTP verbs are identifiers, not copy.
  if (/\/api\//.test(text)) return false;
  if (/^(GET|POST|PATCH|PUT|DELETE)\s/i.test(text)) return false;
  // key=value measurement pairs written by the pipeline.
  if (/[a-z_]+\s*=\s*\S*\d/i.test(text)) return false;
  // UUIDs, hex fragments, file paths, ISO timestamps.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(text)) return false;
  if (/\.(png|jpg|jpeg|webp|mp4|csv|json|txt)\b/i.test(text)) return false;
  if (/^(uploads|storage)\//i.test(text)) return false;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return false;
  // A URL or bare hostname.
  if (/^[a-z]+:\/\/\S/i.test(text) || /^[a-z0-9-]+\.[a-z]{2,}$/i.test(text)) return false;
  // Mostly ASCII letters and digits with no spaces is more likely a token.
  if (/^[A-Za-z0-9_./-]+$/.test(text) && !/^[A-Za-z]+([ -][A-Za-z]+)+$/.test(text)) {
    // Single words are still UI labels ("Overview", "Findings"), so allow those.
    return /^[A-Za-z]+$/.test(text);
  }
  return true;
}

/** Ancestors whose text is data, not prose. */
const SKIP_SELECTOR = [
  "code",
  "pre",
  "kbd",
  "samp",
  "var",
  "textarea",
  "select",
  "option",
  "script",
  "style",
  "[data-no-translate]",
  "[data-i18n-ignore]",
  "[aria-hidden='true']",
  ".telemetry",
].join(",");

function inSkippedSubtree(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return false;
  if (parent.closest(SKIP_SELECTOR)) return true;
  // Class names are matched directly because `.telemetry` inside closest()
  // already covers it; this catches elements carrying the token among others.
  return parent.classList.contains("telemetry");
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<string>(SOURCE_LOCALE);
  const [available, setAvailable] = useState<TranslateLanguages | null>(null);
  const [status, setStatus] = useState<TranslationStatus>("source");
  const [coverage, setCoverage] = useState<Record<string, number>>({});

  const cacheRef = useRef<Cache>({});
  /** Text node -> the English string it was created with. */
  const originalsRef = useRef(new WeakMap<Text, string>());
  /** In-flight strings, so a burst of mutations does not fetch the same text twice. */
  const pendingRef = useRef(new Set<string>());
  /** Set while we write nodeValue, so our own edits do not retrigger the observer. */
  const applyingRef = useRef(false);
  const localeRef = useRef(SOURCE_LOCALE);

  const collectTextNodes = useCallback((): Text[] => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const value = node.nodeValue;
        if (!value || !value.trim()) return NodeFilter.FILTER_REJECT;
        if (inSkippedSubtree(node as Text)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    return nodes;
  }, []);

  /** Write the target-language text for every node whose translation is known. */
  const applyFromCache = useCallback(
    (target: string) => {
      const table = cacheRef.current[target] ?? {};
      const nodes = collectTextNodes();
      let applied = 0;

      applyingRef.current = true;
      try {
        for (const node of nodes) {
          const original = originalsRef.current.get(node) ?? node.nodeValue ?? "";
          // Record before touching the node: this is the only copy of the
          // English source, and without it the language cannot be reverted.
          if (!originalsRef.current.has(node)) originalsRef.current.set(node, original);

          const translated = table[original];
          if (translated && node.nodeValue !== translated && shouldTranslate(original)) {
            node.nodeValue = translated;
            applied += 1;
          }
        }
      } finally {
        applyingRef.current = false;
      }
      return { applied, total: nodes.length };
    },
    [collectTextNodes],
  );

  const restoreSource = useCallback(() => {
    const nodes = collectTextNodes();
    applyingRef.current = true;
    try {
      for (const node of nodes) {
        const original = originalsRef.current.get(node);
        if (original !== undefined && node.nodeValue !== original) {
          node.nodeValue = original;
        }
      }
    } finally {
      applyingRef.current = false;
    }
  }, [collectTextNodes]);

  const requestMissing = useCallback(
    async (target: string): Promise<number> => {
      const table = cacheRef.current[target] ?? {};
      const missing: string[] = [];
      for (const node of collectTextNodes()) {
        const original = originalsRef.current.get(node) ?? node.nodeValue ?? "";
        if (!shouldTranslate(original)) continue;
        if (original in table) continue;
        if (pendingRef.current.has(original)) continue;
        pendingRef.current.add(original);
        missing.push(original);
      }
      if (missing.length === 0) return 0;

      let resolved = 0;
      for (let index = 0; index < missing.length; index += BATCH_SIZE) {
        const batch = missing.slice(index, index + BATCH_SIZE);
        try {
          const response = await api.translate.strings(batch, target);
          const next = { ...(cacheRef.current[target] ?? {}) };
          for (const [source, translated] of Object.entries(response.translated)) {
            next[source] = translated;
            pendingRef.current.delete(source);
            resolved += 1;
          }
          // Anything the upstream dropped is removed from `pending` too, so a
          // later pass can retry it instead of being blocked forever.
          for (const source of batch) {
            if (!(source in response.translated)) pendingRef.current.delete(source);
          }
          cacheRef.current[target] = next;
          writeCache(cacheRef.current);
        } catch {
          for (const source of batch) pendingRef.current.delete(source);
          // Partial failure is normal: whatever arrived stays applied.
        }
      }
      return resolved;
    },
    [collectTextNodes],
  );

  const runLocale = useCallback(
    async (target: string) => {
      localeRef.current = target;
      document.documentElement.lang = target;

      if (target === SOURCE_LOCALE) {
        restoreSource();
        setStatus("source");
        return;
      }

      // Paint everything already known first, so the page switches instantly
      // and stays switched if the network then fails.
      applyFromCache(target);
      const had = Object.keys(cacheRef.current[target] ?? {}).length;
      setStatus(had > 0 ? "cached" : "loading");

      const resolved = await requestMissing(target);
      const { applied } = applyFromCache(target);
      setCoverage((previous) => ({
        ...previous,
        [target]: Object.keys(cacheRef.current[target] ?? {}).length,
      }));

      if (applied > 0 || resolved > 0) {
        setStatus("ready");
      } else {
        setStatus(resolved === 0 && had === 0 ? "unavailable" : "cached");
      }
    },
    [applyFromCache, requestMissing, restoreSource],
  );

  const setLocale = useCallback(
    (target: string) => {
      setLocaleState(target);
      try {
        window.localStorage.setItem(LOCALE_KEY, target);
      } catch {
        /* non-fatal */
      }
      void runLocale(target);
    },
    [runLocale],
  );

  // Boot: learn what the server can translate, restore the saved locale, and
  // replay it from cache. This is the offline path — no request is needed to
  // repaint a language whose strings are already stored.
  useEffect(() => {
    cacheRef.current = readCache();
    let cancelled = false;

    const stored = (() => {
      try {
        return window.localStorage.getItem(LOCALE_KEY);
      } catch {
        return null;
      }
    })();

    void (async () => {
      let listing: TranslateLanguages | null = null;
      try {
        listing = await api.translate.languages();
      } catch {
        // Unreachable or signed out. A stored locale is still replayable.
      }
      if (cancelled) return;
      setAvailable(listing);

      const wanted =
        stored && stored !== SOURCE_LOCALE && (!listing || listing.targets.includes(stored))
          ? stored
          : SOURCE_LOCALE;
      setLocaleState(wanted);
      await runLocale(wanted);
    })();

    return () => {
      cancelled = true;
    };
  }, [runLocale]);

  // Re-apply across React re-renders and route changes. Translations already in
  // cache are applied synchronously inside the mutation callback, so there is
  // no visible flash of English.
  useEffect(() => {
    let timer = 0;
    const observer = new MutationObserver(() => {
      if (applyingRef.current) return;
      if (localeRef.current === SOURCE_LOCALE) return;
      window.clearTimeout(timer);
      // Deliberately a timer and not requestAnimationFrame: rAF is throttled to
      // a halt in a background or hidden tab, so a page opened in the background
      // would queue its translations and never apply them. The DOM write must
      // happen whether or not anything is being painted.
      timer = window.setTimeout(() => {
        const target = localeRef.current;
        if (target === SOURCE_LOCALE) return;
        applyFromCache(target);
        // Unknown strings (a page just navigated to) go out in one batch.
        void requestMissing(target).then(() => applyFromCache(target));
      }, 0);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [applyFromCache, requestMissing]);

  const value = useMemo<LanguageContextValue>(
    () => ({ locale, available, status, coverage, setLocale }),
    [locale, available, status, coverage, setLocale],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
