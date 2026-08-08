/* Stitching Manager Pro — Service Worker */
/* Bump the cache name on every release to force a refresh. */
var CACHE = "stitch-pro-next-v1";
var OFFLINE_URL = "/dashboard";

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

/* Network-first, cache fallback — static shell only. Never touches Supabase (cross-origin)
   or Next.js RSC/data requests, so app data is always fresh. */
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  var isDoc = e.request.mode === "navigate";
  var isStatic = STATIC_EXTENSIONS.some(function (ext) { return url.pathname.endsWith(ext); });
  if (!isDoc && !isStatic) return;

  var netRequest = isDoc ? new Request(url.href, { cache: "reload" }) : e.request;

  e.respondWith(
    fetch(netRequest)
      .then(function (response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, clone); });
        }
        return response;
      })
      .catch(function () {
        return caches.match(e.request).then(function (cached) {
          return cached || caches.match(OFFLINE_URL);
        });
      })
  );
});
