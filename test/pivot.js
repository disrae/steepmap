// Shared checks for "rotate/tilt around the point you grabbed".
// Reports how far (px) the ground point that was under `at` has drifted from `at` after a gesture.
async function groundUnder(page, at) {
  return page.evaluate(([x, y]) => map.unproject([x, y]).toArray(), at);
}
async function drift(page, ll, at) {
  return page.evaluate(([ll, at]) => { const p = map.project(ll); return Math.hypot(p.x - at[0], p.y - at[1]); }, [ll, at]);
}
module.exports = { groundUnder, drift };
