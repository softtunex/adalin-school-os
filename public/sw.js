/*
 * Adalin SchoolHub service worker: opens the pages teachers need without a connection.
 *
 * - App code and styles (/_next/static) are cached the first time they load.
 * - The dashboard, registers and score sheets are saved each time they're opened online, and
 *   shown from that copy when offline. Changes made offline are queued by the page itself and
 *   sent when the connection returns.
 * - Anything else offline shows the offline page.
 * Signing out (reaching the login page) deletes the saved pages, so a shared phone keeps nothing.
 */
// One cache per build (the page registers /sw.js?build=<stamp>): activating a new build deletes the
// old build's app code, so a redeploy that reuses file names never serves stale code.
const VERSION = new URL(self.location.href).searchParams.get("build") || "v2"; // v2: browsers still on the first worker drop its cache on update
const STATIC = `sos-static-${VERSION}`;
const PAGES = "sos-pages";
const OFFLINE = "/offline";

// Pages worth keeping for offline use: a school's home, attendance and score sheets.
const KEEP = [/^\/s\/[^/]+\/?$/, /^\/s\/[^/]+\/attendance(\/|$)/, /^\/s\/[^/]+\/results\/sheet/, /^\/learn\/?$/];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((c) => c.add(new Request(OFFLINE, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("sos-static-") && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-pages") event.waitUntil(caches.delete(PAGES));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // App code: cache first, it never changes under the same name.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode !== "navigate") return;

  if (url.pathname === "/login") {
    event.waitUntil(caches.delete(PAGES));
    return;
  }

  const keep = KEEP.some((r) => r.test(url.pathname));
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (keep && res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(PAGES).then((c) => c.put(url.pathname + url.search, copy));
        }
        return res;
      })
      .catch(async () => (keep && (await caches.match(url.pathname + url.search, { cacheName: PAGES }))) || (await caches.match(OFFLINE)) || Response.error()),
  );
});
