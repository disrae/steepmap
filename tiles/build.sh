#!/usr/bin/env bash
# Build a region's map packs into tiles/build/: <region>-trails.pmtiles and <region>-base.pmtiles from
# OpenStreetMap, plus <region>-dem and <region>-sat from raster.sh.
#   ./tiles/build.sh                     # everything for the default region (sea-to-sky)
#   ./tiles/build.sh sea-to-sky trails   # just one pack: trails, base, dem or sat
# Needs Docker. Downloads (OpenStreetMap extract, ocean polygons, raster tiles) are cached in tiles/data/.
set -euo pipefail

PLANETILER=ghcr.io/onthegomap/planetiler:0.9.1
here="$(cd "$(dirname "$0")" && pwd)"
region="${1:-sea-to-sky}"; what="${2:-all}"
line=$(grep "^$region|" "$here/regions.txt" || true)
if [ -z "$line" ]; then
  echo "Unknown region '$region'. Known regions:"; grep -v '^#' "$here/regions.txt" | cut -d'|' -f1 | sed '/^$/d;s/^/  /'; exit 1
fi
IFS='|' read -r name area bounds <<<"$line"
mkdir -p "$here/data" "$here/build"

planetiler() { # schema, output, extra args...
  local schema="$1" out="$2"; shift 2
  docker run --rm -v "$here":/tiles:ro -v "$here/data":/data "$PLANETILER" generate-custom \
    --schema="/tiles/$schema" --area="$area" --bounds="$bounds" --download --output="/data/$out" --force "$@"
  cp "$here/data/$out" "$here/build/$out"
  echo "Built tiles/build/$out ($(du -h "$here/build/$out" | cut -f1))"
}

if [ "$what" = all ] || [ "$what" = trails ]; then
  # Named routes (OSM route relations) come from the Overpass API; see routes_to_geojson.py for why.
  IFS=, read -r west south east north <<<"$bounds"
  echo "Fetching named routes for $name from Overpass..."
  curl -sf --retry 3 --retry-delay 20 --max-time 300 -A "steepmap-tiles/1.0 (+https://steepmap.ca)" \
    --data-urlencode "data=[out:json][timeout:180];relation[\"type\"=\"route\"][\"route\"~\"^(hiking|foot|ski|piste)\$\"][\"name\"]($south,$west,$north,$east);out geom;" \
    https://overpass-api.de/api/interpreter -o "$here/data/routes-$name.overpass.json"
  python3 -I "$here/routes_to_geojson.py" "$here/data/routes-$name.overpass.json" "$here/data/routes-$name.geojson"
  planetiler trails.yml "$name-trails.pmtiles" --routes="/data/routes-$name.geojson"
fi
if [ "$what" = all ] || [ "$what" = base ]; then planetiler base.yml "$name-base.pmtiles"; fi
if [ "$what" = all ] || [ "$what" = dem ]; then "$here/raster.sh" dem "$name"; fi
if [ "$what" = all ] || [ "$what" = sat ]; then "$here/raster.sh" sat "$name"; fi
