# Map packs

Every Steepmap region has four packs. Each pack is a single `.pmtiles` file, built here into `tiles/build/` and served from Cloudflare R2:

| Pack | Built from | Sea to Sky size |
|---|---|---|
| `<region>-trails` | OpenStreetMap, schema `trails.yml`, using [Planetiler](https://github.com/onthegomap/planetiler) | 13 MB |
| `<region>-base` | OpenStreetMap, schema `base.yml`: land cover, water, ocean, places, parks and ridges for the Topo and Winter maps | 20 MB |
| `<region>-dem` | Mapzen Terrain Tiles (open data on AWS), zoom 0–13, by `raster.sh` | 165 MB |
| `<region>-sat` | Sentinel-2 cloudless 2025 by EOX (CC BY-NC-SA 4.0), zoom 0–13 (10 m pixels), by `raster.sh` | 29 MB |

The Worker serves single tiles out of the packs at `/t/<pack>/{z}/{x}/{y}`. When the app opens online, it downloads each pack whole to the phone, where the service worker serves the same addresses offline.

## What's in the trails pack

| Layer | Contents |
|---|---|
| `trails` | Paths, footways, steps and via ferratas, with SAC difficulty (`sac_scale`), trail visibility, surface, MTB scale and access |
| `roads` | Highways down to forest service roads and 4x4 tracks (`tracktype`, `4wd_only`, access) |
| `ski` | Ski touring trails (`piste:type=skitour`, including combined values like `hike;skitour`), runs with difficulty, and nordic trails |
| `routes` | Named routes from OSM route relations, with length in km: ski traverses (Spearhead, Névé), long hikes (Howe Sound Crest, Baden-Powell), nordic and snowshoe loops |
| `lifts` | Gondolas, chairs and drags |
| `pois` | Peaks, passes, huts, shelters, campsites, trailheads, viewpoints and waterfalls |
| `water_labels` | Names of lakes and glaciers |

Named routes are OSM *relations*, which Planetiler's YAML schema can't read. So `build.sh` fetches them from the Overpass API, and `routes_to_geojson.py` converts them into a GeoJSON source.

If a ski tour is missing, add it to OpenStreetMap and rebuild. Tag the ways `piste:type=skitour`, or make a `route=piste` relation for a named traverse.

## Build and upload

Building needs Docker.

```bash
npm run tiles                      # every pack for sea-to-sky (./tiles/build.sh sea-to-sky)
./tiles/build.sh sea-to-sky trails # one pack: trails, base, dem or sat
npm run tiles:upload               # to R2, for the live site
npm run tiles:upload -- --local    # to the local bucket used by `npm start` and the tests
```

Downloads are cached in `tiles/data/` and reused by later builds:
- the Geofabrik extract (about 1.3 GB for BC)
- the ocean polygons (about 900 MB)
- the raster tiles

To pick up the latest OpenStreetMap edits, delete `tiles/data/sources/` and build again. Phones pick up a rebuilt pack automatically the next time the app opens online, because each pack's ETag changes when it's rebuilt.

## Add a region

1. Add a line to `regions.txt`: `name|geofabrik-area|west,south,east,north`. The Geofabrik area name comes from the URL on https://download.geofabrik.de (for example `british-columbia`, `alberta` or `washington`).
2. Add the region to `web/regions.json` with the same id and bounds. The app and the Worker both read that file.
3. Build it, upload it and deploy.

Keep regions to roughly this size. A whole region downloads to the phone, so a big one means a big download.
