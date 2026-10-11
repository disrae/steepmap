"""Helpers for packing raster tiles (elevation, imagery) into one regional file.

  python3 -I raster_pack.py list URL_TEMPLATE BOUNDS MINZ MAXZ DIR EXT
      Print "url<TAB>path" for each tile covering BOUNDS (west,south,east,north, plus a 1-tile border)
      that isn't in DIR yet. raster.sh downloads them with curl.
  python3 -I raster_pack.py mbtiles DIR OUT NAME FORMAT BOUNDS MINZ MAXZ ATTRIBUTION
      Write the downloaded DIR/z/x/y.EXT tiles into an MBTiles file, which go-pmtiles turns into .pmtiles.

Downloads are left to curl because python.org Python on macOS often can't verify https certificates.
"""
import math
import os
import sqlite3
import sys


def tile_range(bounds, z, pad=1):
    west, south, east, north = bounds
    n = 2 ** z

    def xy(lng, lat):
        r = math.radians(lat)
        return int((lng + 180) / 360 * n), int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n)

    x0, y0 = xy(west, north)
    x1, y1 = xy(east, south)
    return range(max(0, x0 - pad), min(n - 1, x1 + pad) + 1), range(max(0, y0 - pad), min(n - 1, y1 + pad) + 1)


def tiles(bounds, minz, maxz):
    for z in range(minz, maxz + 1):
        xs, ys = tile_range(bounds, z)
        for x in xs:
            for y in ys:
                yield z, x, y


def cmd_list(url, bounds, minz, maxz, folder, ext):
    for z, x, y in tiles(bounds, minz, maxz):
        path = os.path.join(folder, str(z), str(x), f"{y}.{ext}")
        if not os.path.exists(path):
            print(url.replace("{z}", str(z)).replace("{x}", str(x)).replace("{y}", str(y)) + "\t" + path)


def cmd_mbtiles(folder, out, name, fmt, bounds, minz, maxz, attribution):
    if os.path.exists(out):
        os.remove(out)
    db = sqlite3.connect(out)
    db.executescript("CREATE TABLE metadata (name TEXT, value TEXT);"
                     "CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);"
                     "CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row);")
    meta = {"name": name, "format": fmt, "bounds": ",".join(map(str, bounds)), "minzoom": str(minz), "maxzoom": str(maxz),
            "type": "baselayer", "attribution": attribution}
    db.executemany("INSERT INTO metadata VALUES (?, ?)", meta.items())
    count = missing = 0
    for z, x, y in tiles(bounds, minz, maxz):
        path = os.path.join(folder, str(z), str(x), f"{y}.{fmt}")
        if not os.path.exists(path) or os.path.getsize(path) == 0:
            missing += 1
            continue
        with open(path, "rb") as f:
            db.execute("INSERT INTO tiles VALUES (?, ?, ?, ?)", (z, x, 2 ** z - 1 - y, f.read()))  # MBTiles rows count from the south
        count += 1
    db.commit()
    db.close()
    print(f"{count} tiles written to {out}" + (f", {missing} missing" if missing else ""))


if __name__ == "__main__":
    cmd, *a = sys.argv[1:]
    if cmd == "list":
        cmd_list(a[0], [float(v) for v in a[1].split(",")], int(a[2]), int(a[3]), a[4], a[5])
    elif cmd == "mbtiles":
        cmd_mbtiles(a[0], a[1], a[2], a[3], [float(v) for v in a[4].split(",")], int(a[5]), int(a[6]), a[7])
    else:
        sys.exit(__doc__)
