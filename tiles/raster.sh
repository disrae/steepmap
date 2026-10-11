#!/usr/bin/env bash
# Build a raster pack for a region into tiles/build/<region>-<layer>.pmtiles.
#   ./tiles/raster.sh dem                 # elevation for the default region (sea-to-sky)
#   ./tiles/raster.sh dem sea-to-sky
# Tiles are downloaded once into tiles/data/<layer>/ and reused by later builds. Needs Docker (go-pmtiles).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
layer="${1:?layer: dem or sat}"; region="${2:-sea-to-sky}"
line=$(grep "^$region|" "$here/regions.txt" || true)
[ -n "$line" ] || { echo "Unknown region '$region' (see tiles/regions.txt)"; exit 1; }
IFS='|' read -r name _ bounds <<<"$line"

case "$layer" in
  dem) # Mapzen/Tilezen terrain tiles (open data on AWS). In BC the source data is ~20-30 m, which z13 already holds.
    url="https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"; ext=png; minz=0; maxz=13
    attribution="Elevation: Mapzen Terrain Tiles (Canadian Digital Elevation Model, SRTM and others)" ;;
  sat) # Sentinel-2 cloudless by EOX (CC BY-NC-SA 4.0, fine for non-commercial use). 10 m pixels, so z13 is the sharpest.
    url="https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg"; ext=jpg; minz=0; maxz=13
    attribution="Sentinel-2 cloudless 2025 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2025)" ;;
  *) echo "Unknown layer '$layer'"; exit 1 ;;
esac

dir="$here/data/$layer"; mkdir -p "$dir" "$here/build"
python3 -I "$here/raster_pack.py" list "$url" "$bounds" $minz $maxz "$dir" $ext > "$here/data/$layer-todo.tsv"
todo=$(wc -l < "$here/data/$layer-todo.tsv" | tr -d ' ')
echo "Downloading $todo $layer tiles for $name..."
# url<TAB>path per line; 8 at a time, retrying flaky requests
tr '\t' ' ' < "$here/data/$layer-todo.tsv" | xargs -P 8 -n 2 sh -c \
  'mkdir -p "$(dirname "$2")" && curl -sf --retry 4 --retry-delay 2 -A "steepmap-tiles/1.0 (+https://steepmap.ca)" -o "$2.part" "$1" && mv "$2.part" "$2"' _ || true

python3 -I "$here/raster_pack.py" mbtiles "$dir" "$here/data/$name-$layer.mbtiles" "$name $layer" $ext "$bounds" $minz $maxz "$attribution"
docker run --rm -v "$here/data":/data -v "$here/build":/build protomaps/go-pmtiles:v1.30.3 \
  convert "/data/$name-$layer.mbtiles" "/build/$name-$layer.pmtiles"
echo "Built tiles/build/$name-$layer.pmtiles ($(du -h "$here/build/$name-$layer.pmtiles" | cut -f1))"
