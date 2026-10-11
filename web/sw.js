// Steepmap service worker: makes the app work with no signal.
//   Region packs  whole .pmtiles files the app downloads (trails, topo base, elevation, satellite). Map tiles at
//                 /t/<layer>/<z>/<x>/<y> are read straight out of them, the same addresses the Worker serves online.
//   Saved tiles   tiles you chose to keep (saved areas). Never cleared automatically.
//   Viewed tiles  everything else the map loads, kept so recently viewed places work offline too. Capped in size.
importScripts("vendor/pmtiles-3.2.1.js");

const SHELL = "steepmap-shell-v4";
const PACKS = "steepmap-packs-v1";
const SAVED = "steepmap-saved-v1";
const VIEWED = "steepmap-viewed-v1";
const KEEP = [SHELL, PACKS, SAVED, VIEWED];
const VIEWED_MAX = 25000; // tiles (roughly 0.5-1 GB); the oldest go first
const SHELL_FILES = ["./", "index.html", "regions.json", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "vendor/pmtiles-3.2.1.js", "vendor/capacitor-8.5.2.js",
  ...["Noto Sans Medium", "Noto Sans Regular", "Noto Sans Italic"].map((f) => `fonts/${f}/0-255.pbf`),
  "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js",
  "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css",
  "https://unpkg.com/maplibre-contour@0.1.0/dist/index.min.js"];
// map tiles from other servers (imagery, the worldwide overlays)
const TILE_HOSTS = ["server.arcgisonline.com", "tile.opentopomap.org", "tile.waymarkedtrails.org", "tiles.opensnowmap.org"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(SHELL_FILES.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("steepmap-") && !KEEP.includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener("message", (e) => { if (e.data && e.data.type === "packs-changed") packIndex = null; });

/* ---------- region packs ---------- */
class BlobSource { // pmtiles reads byte ranges; a cached file is a disk-backed Blob, so slicing doesn't load it all
  constructor(blob, key) { this.blob = blob; this.key = key; }
  getKey() { return this.key; }
  async getBytes(offset, length) { return { data: await this.blob.slice(offset, offset + length).arrayBuffer() }; }
}
let packIndex = null; // Promise<Map<layer, [{pm, header, bounds}]>>
function packs() {
  if (!packIndex) packIndex = (async () => {
    const out = new Map(), cache = await caches.open(PACKS);
    for (const req of await cache.keys()) {
      const m = /\/tiles\/([\w-]+)-([a-z]+)\.pmtiles$/.exec(req.url); if (!m) continue;
      try {
        const res = await cache.match(req), pm = new pmtiles.PMTiles(new BlobSource(await res.blob(), req.url));
        const header = await pm.getHeader();
        const list = out.get(m[2]) || []; out.set(m[2], list);
        list.push({ pm, header, bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat] });
      } catch (err) { console.warn("Unreadable pack", req.url, err); }
    }
    return out;
  })();
  return packIndex;
}
const TYPES = { 1: "application/x-protobuf", 2: "image/png", 3: "image/jpeg", 4: "image/webp", 5: "image/avif" };
function tileBounds(z, x, y) {
  const n = 2 ** z, lng = (v) => (v / n) * 360 - 180, lat = (v) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * v) / n))) * 180) / Math.PI;
  return [lng(x), lat(y + 1), lng(x + 1), lat(y)];
}
const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
async function fromPacks(layer, z, x, y) {
  const box = tileBounds(z, x, y);
  for (const p of (await packs()).get(layer) || []) {
    if (z < p.header.minZoom || z > p.header.maxZoom || !overlaps(p.bounds, box)) continue;
    const tile = await p.pm.getZxy(z, x, y);
    // inside a saved pack, a missing tile means there's nothing there (open ocean, no trails): answer empty
    return tile ? new Response(tile.data, { headers: { "Content-Type": TYPES[p.header.tileType] || "application/octet-stream" } })
      : new Response(null, { status: 204 });
  }
  return null;
}

/* ---------- single tiles: saved, then viewed, then the network ---------- */
let puts = 0;
async function cacheFirst(req, url) {
  const hit = (await caches.match(url, { cacheName: SAVED })) || (await caches.match(url, { cacheName: VIEWED }));
  if (hit) return hit;
  const res = await fetch(req);
  if (res.status === 200) {
    const copy = res.clone();
    caches.open(VIEWED).then((c) => c.put(url, copy)).then(() => { if (++puts % 500 === 0) trimViewed(); }).catch(() => {});
  }
  return res;
}
async function trimViewed() {
  const c = await caches.open(VIEWED), keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - VIEWED_MAX))) await c.delete(k);
}
async function serveTile(req, url, layer, z, x, y) {
  try { const r = await fromPacks(layer, z, x, y); if (r) return r; } catch (err) { console.warn("pack read failed", err); }
  try { return await cacheFirst(req, url.href); }
  catch { return new Response(null, { status: 204 }); } // offline and never seen: draw nothing instead of erroring
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    const t = /^\/t\/([a-z]+)\/(\d+)\/(\d+)\/(\d+)/.exec(url.pathname);
    if (t) { e.respondWith(serveTile(req, url, t[1], +t[2], +t[3], +t[4])); return; }
    if (url.pathname.startsWith("/tiles/")) return; // pack downloads go straight to the network
    if (url.pathname.startsWith("/fonts/")) { e.respondWith(cacheFirst(req, url.href)); return; } // label glyphs never change
  }
  if (TILE_HOSTS.some((h) => url.hostname.endsWith(h))) { e.respondWith(cacheFirst(req, req.url).catch(() => Response.error())); return; }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  // app shell: network first, fall back to the saved copy when offline
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && (url.origin === location.origin || url.hostname === "unpkg.com")) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match("index.html"))));
});
