// Desktop mouse behaviour.
const { test, expect } = require("@playwright/test");
const { groundUnder, drift } = require("./pivot");

test.setTimeout(180_000); // a 1280x800 3D map is slow on the software GPU used in tests
const GROUSE = { center: [-123.08, 49.375], zoom: 13.5, bearing: 0, pitch: 45 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function openMap(page) {
  await page.addInitScript((v) => { try { localStorage.setItem("view", JSON.stringify(v)); } catch {} }, GROUSE);
  await page.goto("/");
  await page.waitForFunction(() => window.map && window.map.isStyleLoaded(), null, { timeout: 60_000 });
  // wait for full-detail terrain: the ground shape under the grabbed point must not change mid-test
  await page.waitForFunction(() => !window.map.isMoving() && window.map.loaded(), null, { timeout: 45_000 });
  await sleep(500);
}
async function rightDrag(page, from, to, ctrl = false) {
  if (ctrl) await page.keyboard.down("Control");
  await page.mouse.move(...from);
  await page.mouse.down({ button: ctrl ? "left" : "right" });
  for (let i = 1; i <= 20; i++) { await page.mouse.move(from[0] + (to[0] - from[0]) * i / 20, from[1] + (to[1] - from[1]) * i / 20); await sleep(16); }
  await page.mouse.up({ button: ctrl ? "left" : "right" });
  if (ctrl) await page.keyboard.up("Control");
  await page.waitForFunction(() => !window.map.isMoving(), null, { timeout: 15_000 });
}

test("right-drag rotates and tilts around the point you grabbed, not the screen centre", async ({ page }) => {
  await openMap(page);
  const at = [420, 560]; // lower left of a 1280x800 window, well away from the centre
  const ll = await groundUnder(page, at);
  const before = await page.evaluate(() => ({ b: map.getBearing(), p: map.getPitch() }));
  await rightDrag(page, at, [at[0] + 160, at[1] - 30]); // rotate ~130° and tilt ~15°
  const after = await page.evaluate(() => ({ b: map.getBearing(), p: map.getPitch() }));
  expect(Math.abs(after.b - before.b)).toBeGreaterThan(30);
  expect(Math.abs(after.p - before.p)).toBeGreaterThan(5);
  const d = await drift(page, ll, at);
  console.log(`mouse rotate+tilt: grabbed point drifted ${d.toFixed(1)}px`);
  expect(d).toBeLessThan(25);
});

test("ctrl-drag does the same", async ({ page }) => {
  await openMap(page);
  const at = [900, 600];
  const ll = await groundUnder(page, at);
  await rightDrag(page, at, [at[0] - 150, at[1]], true);
  const d = await drift(page, ll, at);
  console.log(`ctrl-drag rotate: grabbed point drifted ${d.toFixed(1)}px`);
  expect(d).toBeLessThan(25);
});

test("grabbing the sky near the horizon falls back to rotating around the centre", async ({ page }) => {
  await openMap(page);
  await page.evaluate(() => map.jumpTo({ pitch: 75 }));
  await page.waitForFunction(() => !window.map.isMoving());
  const c0 = await page.evaluate(() => map.getCenter().toArray());
  await rightDrag(page, [640, 40], [800, 40]);
  const c1 = await page.evaluate(() => map.getCenter().toArray());
  // centre-pivot rotation leaves the map centre where it was (no flinging off to the horizon)
  expect(Math.abs(c1[0] - c0[0]) + Math.abs(c1[1] - c0[1])).toBeLessThan(0.002);
});
