// Phone behaviour: layout, map gestures with real multi-touch, route drawing with fingers, tapping trails.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { touchSession, sleep } = require("./touch");
const { groundUnder, drift } = require("./pivot");

const GROUSE = { center: [-123.08, 49.375], zoom: 14, bearing: 0, pitch: 0 };
// map packs come from the local R2 bucket behind `wrangler dev`: npm run tiles && npm run tiles:upload -- --local
const hasTrails = fs.existsSync(path.join(__dirname, "../tiles/build/sea-to-sky-trails.pmtiles"));
const hasPacks = ["trails", "base", "dem", "sat"].every((p) => fs.existsSync(path.join(__dirname, `../tiles/build/sea-to-sky-${p}.pmtiles`)));

async function openMap(page, view = GROUSE) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((v) => { try { localStorage.setItem("view", JSON.stringify(v)); } catch {} }, view);
  await page.goto("/");
  await page.waitForFunction(() => window.map?.isStyleLoaded?.(), null, { timeout: 60_000 });
  await settle(page);
  return errors;
}
async function settle(page) {
  await page.waitForFunction(() => !window.map.isMoving(), null, { timeout: 15_000 });
  await sleep(300);
}
const state = (page) => page.evaluate(() => ({ zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(), center: map.getCenter().toArray() }));
const middle = (page) => { const v = page.viewportSize(); return [v.width / 2, v.height / 2]; };
const routeCoords = (page) => page.evaluate(() => {
  const line = map.getSource("route").serialize().data.features.find((f) => f.geometry.type === "LineString");
  return line ? line.geometry.coordinates : [];
});

test("fits the phone screen with no sideways scrolling or script errors", async ({ page }) => {
  const errors = await openMap(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator("#layers")).toBeHidden(); // closed by default on phones so the map is visible
  await page.locator("#btnLayers").tap();
  await expect(page.locator("#layers")).toBeVisible();
  const box = await page.locator("#layers").boundingBox(), vp = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  await page.screenshot({ path: test.info().outputPath("layers-open.png") });
  await page.locator("#btnLayers").tap();
  // map credits start collapsed so they don't sit under the elevation/slope readout
  const credits = await page.locator(".maplibregl-ctrl-attrib").boundingBox(), readout = await page.locator("#readout").boundingBox();
  const overlap = credits.x < readout.x + readout.width && readout.x < credits.x + credits.width && credits.y < readout.y + readout.height && readout.y < credits.y + credits.height;
  expect(overlap).toBe(false);
  expect(errors).toEqual([]);
});

test("one finger drags the map", async ({ page }) => {
  await openMap(page);
  const t = await touchSession(page), [cx, cy] = middle(page), before = await state(page);
  await t.drag([cx, cy], [cx - 120, cy + 80]);
  await settle(page);
  const after = await state(page);
  expect(after.center[0]).toBeGreaterThan(before.center[0]); // dragged left, so we look further east
  expect(after.center[1]).toBeGreaterThan(before.center[1]); // dragged down, so we look further north
  expect(Math.abs(after.zoom - before.zoom)).toBeLessThan(0.05);
});

test("pinch zooms in and out", async ({ page }) => {
  await openMap(page);
  const t = await touchSession(page), c = middle(page), z0 = (await state(page)).zoom;
  await t.pinch(c, 40, 140);
  await settle(page);
  const z1 = (await state(page)).zoom;
  expect(z1).toBeGreaterThan(z0 + 0.8);
  await t.pinch(c, 140, 40);
  await settle(page);
  expect((await state(page)).zoom).toBeLessThan(z1 - 0.8);
});

test("two-finger twist rotates the map", async ({ page }) => {
  await openMap(page);
  const t = await touchSession(page);
  await t.twist(middle(page), 90, 50);
  await settle(page);
  expect(Math.abs((await state(page)).bearing)).toBeGreaterThan(20);
});

test("two fingers dragged up tilts into 3D", async ({ page }) => {
  await openMap(page);
  const t = await touchSession(page), [cx, cy] = middle(page);
  await t.tilt([cx, cy + 80], 70, -160);
  await settle(page);
  expect((await state(page)).pitch).toBeGreaterThan(20);
  await page.screenshot({ path: test.info().outputPath("tilted.png") });
});

test("two-finger tilt pivots around the spot between your fingers", async ({ page }) => {
  await openMap(page, { ...GROUSE, pitch: 20 });
  await page.waitForFunction(() => map.loaded(), null, { timeout: 45_000 }); // full-detail terrain under the grabbed spot
  const t = await touchSession(page), v = page.viewportSize();
  const at = [v.width * 0.5, v.height * 0.72]; // low on the screen, away from the centre
  const ll = await groundUnder(page, at);
  await t.tilt(at, 70, -60); // a realistic tilt; past ~65° a pivot this close would put the camera into the slope
  await settle(page);
  expect((await state(page)).pitch).toBeGreaterThan(35);
  const d = await drift(page, ll, at);
  console.log(`touch tilt: grabbed point drifted ${d.toFixed(1)}px`);
  expect(d).toBeLessThan(30);
});

test("plan a route with taps, then drag a point with a finger", async ({ page }) => {
  await openMap(page);
  await page.locator("#btnDraw").tap();
  const [cx, cy] = middle(page);
  const taps = [[cx - 110, cy - 60], [cx, cy - 140], [cx + 100, cy - 40]];
  for (const [x, y] of taps) { await page.touchscreen.tap(x, y); await sleep(250); }
  await expect.poll(async () => (await routeCoords(page)).length).toBe(3);
  await expect(page.locator("#sDist")).not.toHaveText(/^0km$/);

  // grab the middle point slightly off-centre, like a thumb would, and drag it 70px down;
  // the map itself must not pan while doing it
  const before = await state(page), coords = await routeCoords(page);
  const p = await page.evaluate((c) => map.project(c), coords[1]);
  const t = await touchSession(page);
  await t.drag([p.x + 14, p.y + 8], [p.x + 24, p.y + 78], { holdMs: 60 });
  await settle(page);
  const moved = (await routeCoords(page))[1], after = await state(page);
  expect(moved[1]).toBeLessThan(coords[1][1]); // moved south
  expect(Math.abs(after.center[0] - before.center[0])).toBeLessThan(1e-6);
  expect(Math.abs(after.center[1] - before.center[1])).toBeLessThan(1e-6);
  await page.screenshot({ path: test.info().outputPath("route.png") });
});

test("tapping a trail shows its details", async ({ page }) => {
  test.skip(!hasTrails, "trail pack not built yet (npm run tiles)");
  await openMap(page);
  await expect.poll(() => page.evaluate(() => map.queryRenderedFeatures({ layers: map.getStyle().layers.map((l) => l.id).filter((id) => /^trails-(solid|dash|dot)$/.test(id)) }).length)).toBeGreaterThan(0);
  const target = await page.evaluate(() => {
    const ids = map.getStyle().layers.map((l) => l.id).filter((id) => /^trails-(solid|dash|dot)$/.test(id));
    for (const f of map.queryRenderedFeatures({ layers: ids })) {
      const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const line of lines) {
        const pt = map.project(line[Math.floor(line.length / 2)]);
        if (pt.x > 40 && pt.x < innerWidth - 40 && pt.y > 140 && pt.y < innerHeight - 140) return { x: pt.x, y: pt.y };
      }
    }
    return null;
  });
  expect(target).not.toBeNull();
  await page.touchscreen.tap(target.x, target.y);
  const pop = page.locator(".maplibregl-popup .pop");
  await expect(pop).toBeVisible();
  await expect(pop.locator(".k")).not.toBeEmpty();
  await page.screenshot({ path: test.info().outputPath("trail-popup.png") });
});

test("after one visit, the map and trails still work with no network", async ({ page, context }) => {
  test.skip(!hasTrails, "trail pack not built yet (npm run tiles)");
  const trailCount = () => page.evaluate(() => map.queryRenderedFeatures({ layers: map.getStyle().layers.map((l) => l.id).filter((id) => /^trails-(solid|dash|dot)$/.test(id)) }).length);
  await openMap(page);
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30_000 });
  // reload under the service worker so this visit's tiles and the trail file land in its cache
  await page.reload();
  await page.waitForFunction(() => window.map?.isStyleLoaded?.(), null, { timeout: 60_000 });
  await expect.poll(trailCount, { timeout: 30_000 }).toBeGreaterThan(0);
  await settle(page);
  await sleep(2000); // let cache writes finish

  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.map?.isStyleLoaded?.(), null, { timeout: 60_000 });
  await expect.poll(trailCount, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(page.locator("#search")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("offline.png") });
});

async function tapRoute(page, name, avoid) {
  const pt = await page.evaluate(([name, avoid]) => {
    const ids = map.getStyle().layers.map((l) => l.id).filter((id) => /^routes-(hike|ski)$/.test(id));
    const others = avoid ? map.getStyle().layers.map((l) => l.id).filter((id) => new RegExp(avoid).test(id)) : [];
    for (const f of map.queryRenderedFeatures({ layers: ids })) {
      if (f.properties.name !== name) continue;
      const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const line of lines) for (const c of line) {
        const p = map.project(c);
        if (p.x < 60 || p.x > innerWidth - 60 || p.y < 160 || p.y > innerHeight - 160) continue;
        if (others.length && map.queryRenderedFeatures([[p.x - 18, p.y - 18], [p.x + 18, p.y + 18]], { layers: others }).length) continue;
        return { x: p.x, y: p.y };
      }
    }
    return null;
  }, [name, avoid]);
  expect(pt).not.toBeNull();
  await page.touchscreen.tap(pt.x, pt.y);
  return page.locator(".maplibregl-popup .pop");
}

test("named routes: zoomed out, tapping the Howe Sound Crest Trail shows the route and its length", async ({ page }) => {
  test.skip(!hasTrails, "trail pack not built yet (npm run tiles)");
  await openMap(page, { center: [-123.18, 49.467], zoom: 10.6, bearing: 0, pitch: 0 }); // below trail zoom: only routes
  const pop = await tapRoute(page, "Howe Sound Crest Trail", "^(poi-dots|roads|tracks|lifts)");
  await expect(pop.locator("b")).toHaveText("Howe Sound Crest Trail");
  await expect(pop).toContainText("Hiking route");
  await expect(pop).toContainText(/Length\s*2\d(\.\d)? km/);
  await expect(pop.locator("a")).toHaveAttribute("href", /openstreetmap\.org\/relation\//);
});

test("named routes: zoomed in, a trail on the Howe Sound Crest says it's part of it", async ({ page }) => {
  test.skip(!hasTrails, "trail pack not built yet (npm run tiles)");
  await openMap(page, { center: [-123.184, 49.457], zoom: 13, bearing: 0, pitch: 0 }); // on the route
  const pop = await tapRoute(page, "Howe Sound Crest Trail", "^(poi-dots|lifts)");
  await expect(pop).toContainText(/Part of[\s\S]*Howe Sound Crest Trail/);
});

test("ski touring: Hollyburn's winter access trail (tagged hike;skitour) is drawn as a ski tour", async ({ page }) => {
  test.skip(!hasTrails, "trail pack not built yet (npm run tiles)");
  await openMap(page, { center: [-123.18, 49.375], zoom: 13.5, bearing: 0, pitch: 0 });
  await expect.poll(() => page.evaluate(() => {
    const ids = map.getStyle().layers.map((l) => l.id).filter((id) => /^ski-tours$/.test(id));
    return map.queryRenderedFeatures({ layers: ids }).filter((f) => /Hollyburn/.test(f.properties.name || "")).length;
  })).toBeGreaterThan(0);
});

test("opening the app saves the whole region; a place you never looked at works with no signal", async ({ page, context }) => {
  test.skip(!hasPacks, "region packs not built yet (npm run tiles)");
  test.skip(test.info().project.name !== "android", "downloads ~230 MB of packs; once is enough");
  test.setTimeout(300_000);
  await openMap(page); // Grouse
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30_000 });
  // nothing to press: the packs download in the background once the first view has loaded
  await expect.poll(() => page.evaluate(async () => (await (await caches.open("steepmap-packs-v1")).keys()).length), { timeout: 240_000, intervals: [2000] }).toBe(4);
  await expect(page.locator("#btnOffline")).toHaveAttribute("data-state", "ready");

  await context.setOffline(true);
  await page.evaluate(() => localStorage.setItem("prefs", JSON.stringify({ basemap: "topo" })));
  await page.reload();
  await page.waitForFunction(() => window.map?.isStyleLoaded?.(), null, { timeout: 60_000 });
  await page.evaluate(() => map.jumpTo({ center: [-122.95, 50.09], zoom: 13, bearing: 0, pitch: 40 })); // Whistler: never loaded in this test
  const count = (ids) => page.evaluate((ids) => map.queryRenderedFeatures({ layers: ids.filter((id) => map.getLayer(id)) }).length, ids);
  await expect.poll(() => count(["landcover", "water"]), { timeout: 60_000 }).toBeGreaterThan(0); // our topo map
  await expect.poll(() => count(["trails-solid", "trails-dash", "trails-dot", "ski-runs", "lifts"]), { timeout: 60_000 }).toBeGreaterThan(0); // trails
  await expect.poll(() => page.evaluate(() => map.terrain ? map.terrain.getElevationForLngLatZoom(map.getCenter(), 13) : 0), { timeout: 60_000 }).toBeGreaterThan(400); // 3D terrain
  await page.screenshot({ path: test.info().outputPath("offline-whistler.png") });
});

test("the Offline maps panel lists the region and saves the current view for a trip", async ({ page }) => {
  test.skip(!hasPacks, "region packs not built yet (npm run tiles)");
  test.setTimeout(180_000);
  await openMap(page, { center: [-123.08, 49.375], zoom: 16, bearing: 0, pitch: 0 }); // a small area: few imagery tiles
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30_000 });
  await page.locator("#btnOffline").tap();
  const panel = page.locator("#offline");
  await expect(panel).toBeVisible();
  await expect(panel.locator("#offRegions")).toContainText("Sea to Sky");
  for (const name of ["Trails, huts & ski routes", "Topo & winter map", "Terrain: 3D, slope & contours", "Satellite overview"]) await expect(panel).toContainText(name);
  const box = await panel.boundingBox(), vp = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);

  await panel.locator("#btnSaveArea").tap();
  const row = panel.locator("#offAreas li").first();
  await expect(row).toBeVisible();
  await expect(row.locator(".st")).toHaveText(/✓/, { timeout: 120_000 });
  const saved = await page.evaluate(async () => (await (await caches.open("steepmap-saved-v1")).keys()).length);
  expect(saved).toBeGreaterThan(10);
  await page.screenshot({ path: test.info().outputPath("offline-panel.png") });

  await row.locator(".del").tap(); await row.locator(".del").tap(); // delete asks once
  await expect(panel.locator("#offAreas li")).toHaveCount(0);
  expect(await page.evaluate(async () => (await (await caches.open("steepmap-saved-v1")).keys()).length)).toBe(0);
});
