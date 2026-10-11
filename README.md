# Steepline

A FATMAP-style 3D backcountry map for ski touring and hiking. It runs in any modern browser, and you can install it to a phone's home screen.

## What it does
- 3D terrain you can tilt and spin (two-finger drag on a phone, right-drag or Ctrl-drag on a computer)
- Slope-angle shading for avalanche terrain (25°, 30°, 35°, 40°, 45°, 50°+), worked out live from elevation data
- Contour lines, hillshade, and three base maps: Satellite, Topo and Winter (clean white relief)
- Optional hiking trail and ski run/tour overlays
- Elevation, slope and aspect under your cursor
- Route planner: tap to add points, drag to move them. It shows distance, ascent, descent, high point, steepest terrain under the track, and a Munter time estimate (ski tour or hike), plus an elevation profile coloured by slope angle
- Save routes on your device, import and export GPX
- GPS location (the target button)
- Save an area for offline use (only when it's hosted on https)

## Run it
**Quickest:** download the folder and double-click `index.html`. Everything works except offline saving and installing to a phone.

**On your phone (recommended):** host it for free.
1. Go to https://app.netlify.com/drop and drag the `steepline` folder onto the page.
2. Open the https link it gives you on your phone, then use Share → Add to Home Screen (iPhone) or Install app (Android).

GitHub Pages or Cloudflare Pages work too. Any static host does, since there's no server or build step.

## Where the data comes from (all free, no API keys)
- Elevation: Mapzen Terrain Tiles on AWS (Terrarium encoding, about 5–30 m resolution depending on the region)
- Satellite: Esri World Imagery
- Topo: OpenTopoMap
- Trails: Waymarked Trails; ski runs and tours: OpenSnowMap
- Search: OpenStreetMap Nominatim

These are free public services with fair-use limits, so they're fine for personal use. Slope shading comes from a DEM. It can miss small cliffs, gullies and convexities, so it doesn't replace an avalanche forecast or your own judgement in the field.
