#!/usr/bin/env bash
# Upload map packs from tiles/build/ to the steepmap-tiles R2 bucket, where the Worker serves them.
#   ./tiles/upload.sh                          # every pack in tiles/build/
#   ./tiles/upload.sh sea-to-sky-trails        # one pack
#   ./tiles/upload.sh --local                  # the local bucket used by `wrangler dev` (and the tests)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
target=--remote; names=()
for a in "$@"; do if [ "$a" = "--local" ]; then target=--local; else names+=("$a"); fi; done
if [ ${#names[@]} -eq 0 ]; then
  for f in "$here"/build/*.pmtiles; do names+=("$(basename "$f" .pmtiles)"); done
fi
for n in "${names[@]}"; do
  f="$here/build/$n.pmtiles"
  [ -f "$f" ] || { echo "No $f. Build it first: ./tiles/build.sh"; exit 1; }
  echo "Uploading $n.pmtiles ($(du -h "$f" | cut -f1)) $target"
  npx wrangler r2 object put "steepmap-tiles/$n.pmtiles" --file "$f" --content-type application/octet-stream "$target"
done
