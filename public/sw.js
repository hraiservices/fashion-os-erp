/* Fashion Flow — Service Worker */
/* Bump the cache name on every release to force a refresh. v2 also exists to purge the caches
   written by v1, whose fetch handler could poison a request permanently (see below). */
var CACHE = "fashion-flow-v2";

/* App-shell only — Next.js build assets are content-hashed so a stale cache never
   masks a new deploy; the HTML document still bypasses HTTP cache below. */
var PRE_CACHE = ["/manifest.json", "/icon.svg", "/icon-192.png", "/icon-512.png"];
var STATIC_EXTENSIONS = [".js", ".css", ".svg", ".png", ".ico", ".webmanifest", ".json"];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(PRE_CACHE).catch(function () {});
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* Network-first, cache fallback — static assets only. Never touches Supabase (cross-origin)
   or Next.js RSC/data requests, so app data is always fresh.
 *
 * Two deliberate constraints here, both learned the hard way from the Capacitor Android build:
 *
 * 1. Document navigations are NOT intercepted. They used to be, falling back to a cached
 *    "/dashboard" shell — but this is a live-data ERP that can show nothing useful without the
 *    network anyway, so that shell bought almost nothing while putting the service worker in
 *    the path of every page load. In a WebView (cold start, network not yet settled) that is a
 *    much riskier place to be than in a warm browser tab.
 *
 * 2. The promise passed to respondWith() must ALWAYS resolve to a real Response. Resolving to
 *    undefined is not a soft miss — it hard-fails the request as net::ERR_FAILED. v1 could do
 *    exactly that (cache miss, then a miss on a "/dashboard" entry that was never precached),
 *    which is how a flaky first fetch turned into permanently missing CSS/JS chunks and a
 *    half-rendered page. Every branch below ends in a Response or a real network attempt. */
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  if (e.request.mode === "navigate") return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (!STATIC_EXTENSIONS.some(function (ext) { return url.pathname.endsWith(ext); })) return;

  e.respondWith(
    fetch(e.request)
      .then(function (response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, clone); });
        }
        return response;
      })
      .catch(function () {
        return caches.match(e.request).then(function (cached) {
          /* Nothing cached — retry the network rather than resolving undefined. If that fails
             too it rejects, which the browser surfaces as an ordinary failed subresource
             (recoverable on reload) instead of a hard, sticky ERR_FAILED. */
          return cached || fetch(e.request);
        });
      })
  );
});

/* Web Push — the payload is JSON `{ title, body, url }` sent from src/lib/push.ts. Falls back
   to a generic notification if the payload is missing/unparseable so a malformed push never
   silently does nothing. */
self.addEventListener("push", function (e) {
  var data = { title: "Fashion Flow", body: "You have a new notification.", url: "/dashboard" };
  try {
    if (e.data) data = Object.assign(data, e.data.json());
  } catch {
    /* non-JSON payload — keep the defaults */
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/dashboard" },
    })
  );
});

/* Focus an already-open tab on the target URL if one exists, otherwise open a new one — avoids
   piling up duplicate tabs every time a notification is tapped. */
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var targetUrl = (e.notification.data && e.notification.data.url) || "/dashboard";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].url.indexOf(targetUrl) !== -1 && "focus" in clients[i]) return clients[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
