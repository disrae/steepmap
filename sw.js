// Steepline service worker: app shell + cache-first map tiles for offline use.
const SHELL = "steepline-shell-v1";
const TILES = "steepline-tiles-v1";
const SHELL_FILES = ["./", "index.html", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png",
  "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js",
  "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css",
  "https://unpkg.com/maplibre-contour@0.1.0/dist/index.min.js"];
const TILE_HOSTS = ["s3.amazonaws.com", "server.arcgisonline.com", "tile.opentopomap.org", "tile.waymarkedtrails.org", "tiles.opensnowmap.org", "demotiles.maplibre.org"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(SHELL_FILES.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isTile = TILE_HOSTS.some((h) => url.hostname.endsWith(h));
  if (isTile) {
    // cache-first; remember tiles you've viewed so recently seen terrain also works offline
    e.respondWith(caches.match(req.url).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(TILES).then((c) => c.put(req.url, copy)); }
      return res;
    })));
    return;
  }
  // app shell: network first, fall back to cache when offline
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && (url.origin === location.origin || url.hostname === "unpkg.com")) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match("index.html"))));
});
