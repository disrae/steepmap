#!/usr/bin/env python3
"""Turn named routes (OSM route relations from Overpass, `out geom`) into GeoJSON for Planetiler.

OSM stores long routes like the Spearhead Traverse or the Howe Sound Crest Trail as relations that
group many trail segments under one name. Planetiler's YAML schema can't read relations, so build.sh
fetches them from the Overpass API with curl and this script converts them.

  python3 tiles/routes_to_geojson.py overpass.json routes.geojson
"""
import json
import math
import sys


def kind_of(tags):
    route, piste = tags.get("route", ""), tags.get("piste:type", "")
    if "skitour" in piste or route == "ski" and not piste:
        return "skitour"
    if "nordic" in piste:
        return "nordic"
    if "downhill" in piste:
        return "downhill"
    if "hike" in piste or "snowshoe" in piste:
        return "snowshoe"
    if route in ("hiking", "foot"):
        return "hiking"
    return None


def length_km(lines):
    r, total = 6371.0088, 0.0
    for line in lines:
        for (x1, y1), (x2, y2) in zip(line, line[1:]):
            p1, p2 = math.radians(y1), math.radians(y2)
            a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(x2 - x1) / 2) ** 2
            total += 2 * r * math.asin(math.sqrt(a))
    return total


def main(in_path, out_path):
    with open(in_path) as f:
        elements = json.load(f)["elements"]

    features, skipped = [], 0
    for rel in elements:
        tags = rel.get("tags", {})
        kind = kind_of(tags)
        lines = [[(p["lon"], p["lat"]) for p in m["geometry"]] for m in rel.get("members", [])
                 if m.get("type") == "way" and len(m.get("geometry") or []) >= 2]
        if not kind or not lines:
            skipped += 1
            continue
        props = {"name": tags["name"], "kind": kind, "osm_id": rel["id"], "km": round(length_km(lines), 1)}
        for key, out in (("piste:difficulty", "difficulty"), ("network", "network"), ("operator", "operator"),
                         ("description", "description"), ("website", "website"), ("ref", "ref")):
            if tags.get(key):
                props[out] = tags[key]
        features.append({"type": "Feature", "properties": props,
                         "geometry": {"type": "MultiLineString", "coordinates": [[list(p) for p in l] for l in lines]}})

    with open(out_path, "w") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f)
    counts = {}
    for ft in features:
        counts[ft["properties"]["kind"]] = counts.get(ft["properties"]["kind"], 0) + 1
    print(f"Wrote {len(features)} routes to {out_path} {counts} (skipped {skipped} without a usable type or geometry)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
