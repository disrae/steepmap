// Steepmap Worker: the app is static assets (web/). This script redirects to https://steepmap.ca and serves trail files from R2.
// Trail .pmtiles files are read in byte ranges by the map, so Range and conditional requests are passed to R2.

const HOME = "steepmap.ca";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    // One secure address: service workers, GPS and offline storage need https, and storage is per address.
    if ((url.hostname === HOME || url.hostname === "www." + HOME) && (url.protocol === "http:" || url.hostname !== HOME)) {
      return Response.redirect(`https://${HOME}${url.pathname}${url.search}`, 301);
    }
    if (url.pathname.startsWith("/tiles/")) return serveTrailFile(req, env, decodeURIComponent(url.pathname.slice("/tiles/".length)));
    return env.ASSETS.fetch(req);
  },
};

async function serveTrailFile(req, env, key) {
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
