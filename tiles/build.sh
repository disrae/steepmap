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

docker run --rm \
  -v "$here":/tiles:ro \
  -v "$here/data":/data \
  "$PLANETILER" generate-custom \
  --schema=/tiles/trails.yml \
  --area="$area" \
  --bounds="$bounds" \
  --download \
  --output="/data/$name.pmtiles" \
  --force

cp "$here/data/$name.pmtiles" "$here/../web/tiles/$name.pmtiles"
echo "Built web/tiles/$name.pmtiles ($(du -h "$here/../web/tiles/$name.pmtiles" | cut -f1))"
