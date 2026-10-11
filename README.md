# Steepmap

A FATMAP-style 3D backcountry map for ski touring and hiking. It runs in any modern browser, and you can install it to a phone's home screen.

## What it does
- 3D terrain you can tilt and spin (two-finger drag on a phone, right-drag or Ctrl-drag on a computer)
- Slope-angle shading for avalanche terrain (25°, 30°, 35°, 40°, 45°, 50°+), worked out live from elevation data
- Contour lines, hillshade, and three base maps: Satellite, Topo and Winter (clean white relief)
- Trails drawn by difficulty using line style (solid T1–T2, dashed T3, dotted T4+ alpine), so they never clash with the slope colours. Tap a trail, road, run, lift, peak or hut for details. Also includes forest service roads, ski touring routes, lifts, huts and peak elevations. Built from OpenStreetMap, currently for the Sea to Sky area (North Shore to Pemberton)
- Worldwide fallback trail and piste overlays (Waymarked Trails, OpenSnowMap) for areas without built trail data
- Elevation, slope and aspect under your cursor
- Route planner: tap to add points, drag to move them. It shows distance, ascent, descent, high point, steepest terrain under the track, and a Munter time estimate (ski tour or hike), plus an elevation profile coloured by slope angle
- Save routes on your device, import and export GPX
- GPS location (the target button)
- Save an area for offline use (only when it's hosted on https): terrain, slope shading, contours, your base map and trails

## Project layout
- `web/`: the app (a static PWA, no build step). This is the folder you host.
- `tiles/`: builds the trail data from OpenStreetMap. See `tiles/README.md`.
- `mobile/` (planned): a native app sharing the same map style and trail files, with sturdier offline downloads.

## Run it
**On your computer:** run `npx serve web` and open the address it prints. Double-clicking `web/index.html` also works, but without Steepmap trails or offline saving, since browsers block those for local files.

**On your phone (recommended):** host it for free.
1. Go to https://app.netlify.com/drop and drag the `web` folder onto the page.
2. Open the https link it gives you on your phone, then use Share → Add to Home Screen (iPhone) or Install app (Android).

GitHub Pages or Cloudflare Pages work too. Any static host does, since there's no server or build step.

## Hosting (Cloudflare)
The app is a Cloudflare Worker serving `web/` as static files. Trail files live in an R2 bucket (`steepmap-tiles`), and a small script (`worker/index.js`) serves them at `/tiles/...` with byte-range support. There's no other server code.

- `npm run deploy`: publish the app
- `npm run tiles:upload`: upload the trail files in `web/tiles/` to R2 (after `npm run trails`)
- `npm run dev`: run the Worker locally (upload trails to the local bucket first with `./tiles/upload.sh --local`)

## Tests
`npm install` once, then `npm test`. Add `BASE_URL=http://localhost:8787` to test against `npm run dev`. It runs the app in Chrome emulating an Android phone and an iPhone-sized screen. It does real multi-finger touch (one-finger drag, pinch, twist, two-finger tilt), plans a route with taps, drags a route point with a finger and taps a trail, and checks the layout fits the screen, and checks that the map and trails still load with the network off after one visit. Screenshots land in `test-results/`; `npm run test:headed` shows the browser while it runs.

## Where the data comes from (all free, no API keys)
- Elevation: Mapzen Terrain Tiles on AWS (Terrarium encoding, about 5–30 m resolution depending on the region)
- Satellite: Esri World Imagery
- Topo: OpenTopoMap
- Trails, roads, huts and peaks: OpenStreetMap, built into tiles by `tiles/build.sh`
- Worldwide fallback overlays: Waymarked Trails, OpenSnowMap
- Search: OpenStreetMap Nominatim

These are free public services with fair-use limits, so they're fine for personal use. Slope shading comes from a DEM. It can miss small cliffs, gullies and convexities, so it doesn't replace an avalanche forecast or your own judgement in the field.
