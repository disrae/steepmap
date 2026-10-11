# Trail tiles

Steepmap's trail layer is built from OpenStreetMap with [Planetiler](https://github.com/onthegomap/planetiler) into a single `.pmtiles` file per region. The web app reads it from `web/tiles/`. You host it yourself and need no API key, so it's fine to use publicly too (OSM data is ODbL, so keep the attribution).

## What's in it

| Layer | Contents |
|---|---|
| `trails` | Paths, footways, steps, via ferratas, with SAC difficulty (`sac_scale`), trail visibility, surface, MTB scale and access |
| `roads` | Highways down to forest service roads and 4x4 tracks (`tracktype`, `4wd_only`, access) |
| `ski` | Ski touring trails (`piste:type=skitour`, including combined values like `hike;skitour`), runs with difficulty, nordic trails |
| `routes` | Named routes from OSM route relations: ski traverses (Spearhead, Névé), long hikes (Howe Sound Crest, Baden-Powell), nordic and snowshoe loops, with length in km |
| `lifts` | Gondolas, chairs, drags |
| `pois` | Peaks, passes, huts, shelters, campsites, trailheads, viewpoints, waterfalls |
| `water_labels` | Names of lakes and glaciers |

The schema is `trails.yml`. Edit it to add tags or features, then rebuild. Named routes are OSM *relations*, which Planetiler's YAML schema can't read, so `build.sh` fetches them from the Overpass API and `routes_to_geojson.py` converts them into a GeoJSON source.

Missing a ski tour? Add it to OpenStreetMap (tag the ways `piste:type=skitour`, or make a `route=piste` relation for a named traverse) and rebuild; it shows up here and in every other OSM map.

## Build a region

Needs Docker.

```bash
./tiles/build.sh sea-to-sky
```

The first run downloads the Geofabrik extract for the province or state into `tiles/data/` (about 1.3 GB for BC). Later builds reuse it. The finished file is copied to `web/tiles/<region>.pmtiles`. Then `npm run tiles:upload` puts it in R2 for the live site.

To refresh with the latest OSM edits, delete `tiles/data/sources/` and build again.

## Add a region

1. Add a line to `REGIONS` in `build.sh`: `name|geofabrik-area|west,south,east,north`. The Geofabrik area name comes from the URL on https://download.geofabrik.de (for example `british-columbia`, `alberta`, `washington`).
2. Add the same name and bounds to `TRAIL_AREAS` in `web/index.html`.
3. Build it.
