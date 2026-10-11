// Multi-finger touch for Playwright via the Chrome DevTools protocol.
// Playwright's own touchscreen only does single taps; maps need drags, pinches, twists and two-finger tilts.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function touchSession(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, pts) => cdp.send("Input.dispatchTouchEvent", {
    type, touchPoints: pts.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })),
  });
  // Move fingers from `from` to `to` (arrays of [x, y], one per finger) over `steps` frames.
  async function gesture(from, to, { steps = 16, frameMs = 16, holdMs = 0 } = {}) {
    await send("touchStart", from);
    if (holdMs) await sleep(holdMs);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await send("touchMove", from.map(([x, y], k) => [x + (to[k][0] - x) * t, y + (to[k][1] - y) * t]));
      await sleep(frameMs);
    }
    await send("touchEnd", []);
  }
  return {
    drag: (a, b, opts) => gesture([a], [b], opts),
    pinch(c, r0, r1, opts) { // two fingers on a horizontal line through c, spreading from radius r0 to r1
      return gesture([[c[0] - r0, c[1]], [c[0] + r0, c[1]]], [[c[0] - r1, c[1]], [c[0] + r1, c[1]]], opts);
    },
    twist(c, r, deg, opts) { // two fingers rotating around c
      const a = (deg * Math.PI) / 180, p = (s) => [c[0] + s * r * Math.cos(a), c[1] + s * r * Math.sin(a)];
      return gesture([[c[0] - r, c[1]], [c[0] + r, c[1]]], [p(-1), p(1)], { steps: 24, ...opts });
    },
    tilt(c, spread, dy, opts) { // two fingers side by side, moved vertically together
      return gesture([[c[0] - spread, c[1]], [c[0] + spread, c[1]]], [[c[0] - spread, c[1] + dy], [c[0] + spread, c[1] + dy]], { steps: 20, ...opts });
    },
  };
}

module.exports = { touchSession, sleep };
