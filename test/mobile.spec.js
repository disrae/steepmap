// Phone behaviour: layout, map gestures with real multi-touch, route drawing with fingers, tapping trails.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { touchSession, sleep } = require("./touch");

const GROUSE = { center: [-123.08, 49.375], zoom: 14, bearing: 0, pitch: 0 };
const hasTrails = fs.existsSync(path.join(__dirname, "../web/tiles/sea-to-sky.pmtiles"));

async function openMap(page, view = GROUSE) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((v) => { try { localStorage.setItem("view", JSON.stringify(v)); } catch {} }, view);
  await page.goto("/");
  await page.waitForFunction(() => window.map && window.map.isStyleLoaded(), null, { timeout: 60_000 });
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
  test.skip(!hasTrails, "web/tiles/sea-to-sky.pmtiles not built yet (npm run trails)");
  await openMap(page);
  await expect.poll(() => page.evaluate(() => map.queryRenderedFeatures({ layers: map.getStyle().layers.map((l) => l.id).filter((id) => /^trails-(solid|dash|dot)-/.test(id)) }).length)).toBeGreaterThan(0);
  const target = await page.evaluate(() => {
    const ids = map.getStyle().layers.map((l) => l.id).filter((id) => /^trails-(solid|dash|dot)-/.test(id));
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
