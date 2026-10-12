/*
 * Inspectra AI offline service worker.
 *
 * Scope is deliberately narrow. This application's purpose is running an OpenCV
 * pipeline against a database; none of that happens in a browser, so "offline"
 * cannot mean "keep inspecting". It means three concrete things:
 *
 *   1. The shell loads with no network — styles, scripts, fonts, the icon.
 *   2. The last data you actually saw is still on screen, labelled as stale
 *      rather than silently presented as current.
 *   3. Anything that would write is refused loudly, because a queued upload that
 *      never lands, or an action that looks saved and is not, is worse than an
 *      error.
 *
 * API reads are network-first with a cache fallback, and a cached answer is
 * marked with `x-inspectra-served-by: cache` plus its age so the client can say
 * "offline · data as of 14:32" instead of pretending it is live.
 */

const VERSION = "v1";
const SHELL_CACHE = `inspectra-shell-${VERSION}`;
const PAGE_CACHE = `inspectra-pages-${VERSION}`;
const API_CACHE = `inspectra-api-${VERSION}`;

// Built by `next build`; hashed asset URLs are matched by prefix below rather
// than enumerated here, because the exact filenames change every build and a
// hardcoded list would go stale the first time something is edited.
const PRECACHE_URLS = ["/", "/login", "/register", "/icon.svg", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![SHELL_CACHE, PAGE_CACHE, API_CACHE].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const isApi = (url) => url.pathname === "/backend-api" || url.pathname.startsWith("/backend-api/");
const isStatic = (url) => url.pathname.startsWith("/_next/static/");
const isImage = (url) =>
  url.pathname.startsWith("/storage/") ||
  url.pathname.startsWith("/icon") ||
  url.pathname.endsWith(".ico") ||
  url.pathname.endsWith(".png");

/** Copy a cached Response and add the headers that tell the client it is stale. */
async function markServedFromCache(cached) {
  const dateHeader = cached.headers.get("date");
  const age = dateHeader
    ? Math.max(0, Math.round((Date.now() - new Date(dateHeader).getTime()) / 1000))
    : null;
  const body = await cached.arrayBuffer();
  const headers = new Headers(cached.headers);
  headers.set("x-inspectra-served-by", "cache");
  if (age !== null) headers.set("x-inspectra-cache-age-seconds", String(age));
  return new Response(body, { status: cached.status, statusText: cached.statusText, headers });
}

async function put(cacheName, request, response) {
  if (!response || response.status !== 200 || response.type === "error") return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    // Deliberately not intercepted. A write attempted while disconnected fails
    // at the network layer and surfaces as a real error in the UI, which is the
    // honest outcome — a queue that replays later, or a swallowed request, would
    // tell the operator something was saved when nothing was.
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Immutable build output: cache wins, network never needed.
  if (isStatic(url) || isImage(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            put(SHELL_CACHE, request, response.clone());
            return response;
          }),
      ),
    );
    return;
  }

  if (isApi(url)) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          // Only JSON is worth keeping; a 401 page or an error body is not data.
          if (response.ok && (response.headers.get("content-type") || "").includes("json")) {
            put(API_CACHE, request, response.clone());
            return response;
          }
          // stale-if-error. A 502/500 from the proxy means the API is down, not
          // that the operator asked for data that does not exist. Serving the
          // last good answer — visibly marked — beats an empty dashboard, and
          // the marker is what keeps that honest rather than deceptive.
          if (response.status >= 500) {
            const cached = await caches.match(request);
            if (cached) return markServedFromCache(cached);
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return markServedFromCache(cached);
          return new Response(
            JSON.stringify({
              detail: "Offline, and no cached copy of this data was taken.",
              offline: true,
            }),
            { status: 504, headers: { "content-type": "application/json" } },
          );
        }),
    );
    return;
  }

  // Pages: network first so a deploy is picked up, cache as the offline floor.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (request.mode === "navigate") put(PAGE_CACHE, request, response.clone());
        return response;
      })
      .catch(async () => {
        const cached =
          (await caches.match(request)) ||
          (await caches.match(PRECACHE_URLS[0])) ||
          (await caches.match("/"));
        return cached || Response.error();
      }),
  );
});
