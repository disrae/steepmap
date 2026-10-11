# Steepmap

A FATMAP-style 3D backcountry map for ski touring and hiking. It runs in any modern browser, and you can install it to a phone's home screen.

## What it does
- 3D terrain you can tilt and spin (two-finger drag on a phone, right-drag or Ctrl-drag on a computer)
- Slope-angle shading for avalanche terrain (25°, 30°, 35°, 40°, 45°, 50°+), worked out live from elevation data
- Contour lines, hillshade, and three base maps: Satellite, Topo (our own, from OpenStreetMap) and Winter (the same map under snow: white open ground, dark forest, frozen lakes)
- Trails drawn by difficulty using line style (solid T1–T2, dashed T3, dotted T4+ alpine), so they never clash with the slope colours. Tap a trail, road, run, lift, peak or hut for details. Also includes forest service roads, ski touring routes, lifts, huts and peak elevations. Built from OpenStreetMap, currently for the Sea to Sky area (North Shore to Pemberton)
- Worldwide fallback trail and piste overlays (Waymarked Trails, OpenSnowMap) for areas without built trail data
- Elevation, slope and aspect under your cursor
- Route planner: tap to add points, drag to move them. It shows distance, ascent, descent, high point, steepest terrain under the track, and a Munter time estimate (ski tour or hike), plus an elevation profile coloured by slope angle
- Save routes on your device, import and export GPX
- GPS location (the target button)
- Offline by default. Opening the app online saves the whole region to the phone and keeps it up to date: trails, topo and winter map, 3D terrain, slope shading, contours and a 10 m satellite overview. Everything you look at is kept too. For sharp satellite on a trip, save the view from the Offline maps screen; saving a route also saves the imagery along it

## Project layout
- `web/`: the app (a static PWA, no build step). `web/regions.json` lists the regions and their map packs.
- `worker/`: the Cloudflare Worker. It serves map tiles out of the region packs in R2.
- `tiles/`: builds the region packs (trails, base map, elevation, satellite). See `tiles/README.md`.
- `mobile/` (planned): a Capacitor app wrapping `web/` for background GPS tracking and storage the phone never clears.

## Run it
`npm install`, then `npm start` runs the app and the Worker locally at http://localhost:4173. The Worker needs map packs in its local R2 bucket. Build them with `npm run tiles` (needs Docker), then load them with `npm run tiles:upload -- --local`.

## Hosting (Cloudflare)
The app is a Cloudflare Worker at https://steepmap.ca. It serves `web/` as static files, and `worker/index.js` serves the map packs from the R2 bucket `steepmap-tiles`:
- `/tiles/<pack>.pmtiles`: whole packs, for phones to save
- `/t/<pack>/{z}/{x}/{y}`: single tiles, for viewing online

Outside our regions, elevation comes from the open Terrain Tiles on AWS.
- `npm run deploy`: publish the app and Worker
- `npm run tiles:upload`: upload the packs in `tiles/build/` to R2

## Tests
`npm test` runs against the local Worker; load the packs into the local bucket first (see Run it). Add `BASE_URL=https://steepmap.ca` to test the live site. It runs the app in Chrome emulating an Android phone and an iPhone-sized screen. It does real multi-finger touch (one-finger drag, pinch, twist, two-finger tilt), plans a route with taps, drags a route point with a finger and taps a trail, and checks the layout fits the screen, and checks the offline behaviour:
- the region downloads by itself, and a place you never viewed works with the network off
- the Offline maps screen saves and deletes an area

Screenshots land in `test-results/`; `npm run test:headed` shows the browser while it runs.

## Where the data comes from (all free, no API keys)
- Elevation: Mapzen Terrain Tiles on AWS (Terrarium encoding, about 20 m in BC), packed per region into R2
- Satellite: Sentinel-2 cloudless 2025 by EOX (10 m, ours, saved offline per region) under Esri World Imagery (sharp, online, plus what you view or save)
- Topo and Winter: our own base map from OpenStreetMap inside our regions; OpenTopoMap elsewhere
- Map label fonts: Noto Sans (SIL Open Font License), in `web/fonts/`
- Trails, roads, huts and peaks: OpenStreetMap, built into tiles by `tiles/build.sh`
- Worldwide fallback overlays: Waymarked Trails, OpenSnowMap
- Search: OpenStreetMap Nominatim

These are free public services with fair-use limits, so they're fine for personal use. Slope shading comes from a DEM. It can miss small cliffs, gullies and convexities, so it doesn't replace an avalanche forecast or your own judgement in the field.
