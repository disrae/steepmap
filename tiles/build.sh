#!/usr/bin/env bash
# Build a Steepmap trail tileset for a region and drop it into web/tiles/.
#   ./tiles/build.sh                 # builds the default region (sea-to-sky)
#   ./tiles/build.sh sea-to-sky
# Needs Docker. The first run downloads the Geofabrik extract into tiles/data/ (cached for later runs).
set -euo pipefail

PLANETILER=ghcr.io/onthegomap/planetiler:0.9.1

# name | Geofabrik extract | bounds (west,south,east,north)
REGIONS="
sea-to-sky|british-columbia|-123.65,49.25,-122.40,50.50
"

region="${1:-sea-to-sky}"
line=$(printf '%s\n' "$REGIONS" | grep "^$region|" || true)
if [ -z "$line" ]; then
  echo "Unknown region '$region'. Known regions:"; printf '%s\n' "$REGIONS" | cut -d'|' -f1 | sed '/^$/d;s/^/  /'; exit 1
fi
IFS='|' read -r name area bounds <<<"$line"

here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$here/data" "$here/../web/tiles"

# Named routes (OSM route relations) come from the Overpass API; see routes_to_geojson.py for why.
IFS=, read -r west south east north <<<"$bounds"
echo "Fetching named routes for $name from Overpass..."
curl -sf --retry 3 --retry-delay 20 --max-time 300 -A "steepmap-tiles/1.0 (+https://steepmap.ca)" \
  --data-urlencode "data=[out:json][timeout:180];relation[\"type\"=\"route\"][\"route\"~\"^(hiking|foot|ski|piste)\$\"][\"name\"]($south,$west,$north,$east);out geom;" \
  https://overpass-api.de/api/interpreter -o "$here/data/routes-$name.overpass.json"
python3 -I "$here/routes_to_geojson.py" "$here/data/routes-$name.overpass.json" "$here/data/routes-$name.geojson"

docker run --rm \
  -v "$here":/tiles:ro \
  -v "$here/data":/data \
  "$PLANETILER" generate-custom \
  --schema=/tiles/trails.yml \
  --area="$area" \
  --bounds="$bounds" \
  --routes="/data/routes-$name.geojson" \
  --download \
  --output="/data/$name.pmtiles" \
  --force

cp "$here/data/$name.pmtiles" "$here/../web/tiles/$name.pmtiles"
echo "Built web/tiles/$name.pmtiles ($(du -h "$here/../web/tiles/$name.pmtiles" | cut -f1))"
