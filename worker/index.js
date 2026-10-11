// Steepmap Worker: the app is static assets (web/). This script redirects to https://steepmap.ca and serves map data from R2.
//   /tiles/<file>.pmtiles   whole region packs, for the app to save on the phone (Range and conditional requests pass to R2)
//   /t/<layer>/<z>/<x>/<y>  single tiles read out of those packs, for viewing online. The phone's service worker answers
//                           the same addresses from its saved packs, so the map works the same with no signal.
import { PMTiles, EtagMismatch } from "pmtiles";
import manifest from "../web/regions.json";

const HOME = "steepmap.ca";
// Elevation outside our regions (the "Go to" places around the world) comes from the open Terrain Tiles on AWS.
const DEM_FALLBACK = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    // One secure address: service workers, GPS and offline storage need https, and storage is per address.
    if ((url.hostname === HOME || url.hostname === "www." + HOME) && (url.protocol === "http:" || url.hostname !== HOME)) {
      return Response.redirect(`https://${HOME}${url.pathname}${url.search}`, 301);
    }
    if (url.pathname.startsWith("/tiles/")) return servePack(req, env, decodeURIComponent(url.pathname.slice("/tiles/".length)));
    const t = /^\/t\/([a-z]+)\/(\d+)\/(\d+)\/(\d+)(\.\w+)?$/.exec(url.pathname);
    if (t) return serveTile(req, env, t[1], +t[2], +t[3], +t[4]);
    return env.ASSETS.fetch(req);
  },
};

/* ---------- single tiles ---------- */
const TYPES = { 1: "application/x-protobuf", 2: "image/png", 3: "image/jpeg", 4: "image/webp", 5: "image/avif" };
const archives = new Map(); // key -> PMTiles, kept while this Worker instance lives

class R2Source {
  constructor(bucket, key) { this.bucket = bucket; this.key = key; }
  getKey() { return this.key; }
  async getBytes(offset, length, signal, etag) {
    const obj = await this.bucket.get(this.key, { range: { offset, length } });
    if (!obj) throw new Error(`${this.key} is missing from R2`);
    if (etag && obj.etag !== etag) throw new EtagMismatch(); // pack was rebuilt; PMTiles re-reads the header and retries
    return { data: await obj.arrayBuffer(), etag: obj.etag };
  }
}
function archive(env, key) {
  let a = archives.get(key);
  if (!a) { a = new PMTiles(new R2Source(env.TILES, key)); archives.set(key, a); }
  return a;
}
function tileBounds(z, x, y) {
  const n = 2 ** z, lng = (v) => (v / n) * 360 - 180, lat = (v) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * v) / n))) * 180) / Math.PI;
  return [lng(x), lat(y + 1), lng(x + 1), lat(y)];
}
const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

async function serveTile(req, env, layer, z, x, y) {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const box = tileBounds(z, x, y);
  for (const r of manifest.regions) {
    if (!r.packs.includes(layer) || !overlaps(r.bounds, box)) continue;
    const pm = archive(env, `${r.id}-${layer}.pmtiles`);
    try {
      const header = await pm.getHeader();
      if (z > header.maxZoom) continue;
      const tile = await pm.getZxy(z, x, y);
      if (!tile) continue;
      return new Response(req.method === "HEAD" ? null : tile.data, { headers: {
        "Content-Type": TYPES[header.tileType] || "application/octet-stream",
        "Cache-Control": "public, max-age=3600", // packs are rebuilt now and then; an hour keeps edits flowing
      } });
    } catch (e) {
      console.warn(`tile ${layer}/${z}/${x}/${y} from ${r.id}: ${e.message}`);
    }
  }
  if (layer === "dem" && z <= 15) {
    const res = await fetch(DEM_FALLBACK.replace("{z}", z).replace("{x}", x).replace("{y}", y), { cf: { cacheTtl: 30 * 86400, cacheEverything: true } });
    if (res.ok) return new Response(res.body, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=604800" } });
  }
  // nothing here: an empty answer, so the map just draws nothing for this square
  return new Response(null, { status: 204, headers: { "Cache-Control": "public, max-age=3600" } });
}

/* ---------- whole packs ---------- */
async function servePack(req, env, key) {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  if (!/^[\w.-]+\.pmtiles$/.test(key)) return new Response("Not found", { status: 404 });

  const ranged = req.headers.has("range");
  const obj = req.method === "HEAD"
    ? await env.TILES.head(key)
    : await env.TILES.get(key, { range: ranged ? req.headers : undefined, onlyIf: req.headers });
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("ETag", obj.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Type", "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=0, must-revalidate"); // always revalidate; the ETag makes that cheap

  // onlyIf failed: the browser's copy is current (If-None-Match) or it changed (If-Match)
  if (req.method === "GET" && !("body" in obj)) {
    return new Response(null, { status: req.headers.has("if-none-match") ? 304 : 412, headers });
  }
  if (req.method === "HEAD") {
    headers.set("Content-Length", String(obj.size));
    return new Response(null, { headers });
  }
  if (ranged && obj.range) {
    const { start, end } = rangeBounds(obj.range, obj.size);
    if (start >= obj.size || end < start) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${obj.size}` } });
    headers.set("Content-Range", `bytes ${start}-${end}/${obj.size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(obj.size));
  return new Response(obj.body, { headers });
}

// R2 reports the range it returned as {offset, length}, {offset} or {suffix}.
function rangeBounds(r, size) {
  if ("suffix" in r && r.suffix != null) return { start: Math.max(0, size - r.suffix), end: size - 1 };
  const start = r.offset ?? 0;
  const end = r.length != null ? Math.min(start + r.length, size) - 1 : size - 1;
  return { start, end };
}
