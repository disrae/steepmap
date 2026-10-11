// Steepmap service worker: app shell, cache-first map tiles, and whole-file trail data for offline use.
const SHELL = "steepmap-shell-v2";
const TILES = "steepmap-tiles-v1";
const TRAILS = "steepmap-trails-v1";
const SHELL_FILES = ["./", "index.html", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png",
  "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js",
  "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css",
  "https://unpkg.com/maplibre-contour@0.1.0/dist/index.min.js",
  "https://unpkg.com/pmtiles@3.2.1/dist/pmtiles.js"];
const TILE_HOSTS = ["s3.amazonaws.com", "server.arcgisonline.com", "tile.opentopomap.org", "tile.waymarkedtrails.org", "tiles.opensnowmap.org", "demotiles.maplibre.org"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(SHELL_FILES.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("steepmap-shell-") && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())));

/* ---------- trail files (.pmtiles) ----------
   The map reads small byte ranges from one file. Keep the whole file in the cache and slice ranges from
   it, so trails work offline. Once per worker lifetime, check the server for a rebuilt file. */
const trailBufs = new Map(); // url -> Promise<{buf, etag}>
const checked = new Set();
async function loadTrailFile(url) {
  const cache = await caches.open(TRAILS);
  let res = await cache.match(url);
  if (!res) {
    res = await fetch(url);
    if (!res.ok) throw new Error("trail file " + res.status);
    await cache.put(url, res.clone());
  } else if (!checked.has(url)) {
    checked.add(url);
    refreshTrailFile(url, res.headers.get("etag"), res.headers.get("last-modified"));
  }
  return { buf: await res.arrayBuffer(), etag: res.headers.get("etag") || res.headers.get("last-modified") || "" };
}
async function refreshTrailFile(url, etag, modified) {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return;
    const same = (etag && res.headers.get("etag") === etag) || (!etag && modified && res.headers.get("last-modified") === modified);
    if (same) return;
    const cache = await caches.open(TRAILS);
    await cache.put(url, res);
    trailBufs.delete(url); // next request picks up the new file
  } catch { /* offline: keep what we have */ }
}
async function trailRange(req, url) {
  let p = trailBufs.get(url);
  if (!p) { p = loadTrailFile(url); trailBufs.set(url, p); p.catch(() => trailBufs.delete(url)); }
  let file;
  try { file = await p; } catch { return fetch(req); }
  const { buf, etag } = file, len = buf.byteLength;
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.get("range") || "");
  if (!m) return new Response(buf, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(len) } });
  const start = +m[1], end = Math.min(m[2] ? +m[2] : len - 1, len - 1);
  if (start >= len) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${len}` } });
  const headers = { "Content-Type": "application/octet-stream", "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${len}` };
  if (etag) headers.ETag = etag;
  return new Response(buf.slice(start, end + 1), { status: 206, headers });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.endsWith(".pmtiles")) {
    e.respondWith(trailRange(req, url.origin + url.pathname));
    return;
  }
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
