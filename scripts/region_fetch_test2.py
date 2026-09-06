"""Correct GIBS EPSG:4326 regional fetch test with proper tile grid math."""
import time
import gzip
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, '/home/z/my-project/scripts')
from mvt_probe import decode_tile_points

BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/{layer}/default/{date}/{tms}/{z}/{y}/{x}.mvt"

# GIBS EPSG:4326 tile grids (from capabilities)
GRIDS = {
    "1km": {0: (2, 1), 1: (3, 2), 2: (5, 3), 3: (10, 5), 4: (20, 10), 5: (40, 20), 6: (80, 40)},
    "500m": {0: (2, 1), 1: (3, 2), 2: (5, 3), 3: (10, 5), 4: (20, 10), 5: (40, 20), 6: (80, 40), 7: (160, 80)},
}


def bbox_tiles(west, south, east, north, z, tms="1km"):
    cols, rows = GRIDS[tms][z]
    tw = 360.0 / cols
    th = 180.0 / rows
    x0 = int((west + 180) / tw)
    x1 = int((east + 180) / tw)
    y0 = int((90 - north) / th)
    y1 = int((90 - south) / th)
    tiles = []
    for x in range(max(0, x0), min(cols - 1, x1) + 1):
        for y in range(max(0, y0), min(rows - 1, y1) + 1):
            tiles.append((z, y, x))
    return tiles


def fetch(args):
    layer, date, tms, tile = args
    z, y, x = tile
    url = BASE.format(layer=layer, date=date, tms=tms, z=z, y=y, x=x)
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
        if data[:2] == b'\x1f\x8b':
            data = gzip.decompress(data)
        return tile, data
    except Exception:
        return tile, b''


def region_test(name, west, south, east, north, z, layer="MODIS_Terra_Thermal_Anomalies_All", tms="1km", date="2026-09-05"):
    t0 = time.time()
    tiles = bbox_tiles(west, south, east, north, z, tms)
    jobs = [(layer, date, tms, t) for t in tiles]
    total = 0
    sample = None
    lat_rng = [90, -90]
    lon_rng = [180, -180]
    with ThreadPoolExecutor(max_workers=12) as ex:
        for tile, data in ex.map(fetch, jobs):
            if not data:
                continue
            for lname, feats in decode_tile_points(data).items():
                total += len(feats)
                for f in feats[:1] if not sample else []:
                    pass
                if feats:
                    if sample is None:
                        sample = feats[0]
                    for f in feats:
                        la, lo = f["LATITUDE"], f["LONGITUDE"]
                        lat_rng[0] = min(lat_rng[0], la); lat_rng[1] = max(lat_rng[1], la)
                        lon_rng[0] = min(lon_rng[0], lo); lon_rng[1] = max(lon_rng[1], lo)
    dt = time.time() - t0
    in_bbox = 0
    print(f"{name} z{z}: {len(tiles)} tiles, {total} pts in {dt:.1f}s | lat {lat_rng[0]:.1f}..{lat_rng[1]:.1f} lon {lon_rng[0]:.1f}..{lon_rng[1]:.1f}")
    return total


print("--- Borneo region (109-119E, 4S-4N) ---")
region_test("MODIS", 109, -4, 119, 4, 5)
region_test("MODIS", 109, -4, 119, 4, 6)
region_test("VIIRS", 109, -4, 119, 4, 6, "VIIRS_SNPP_Thermal_Anomalies_375m_All", "500m")
region_test("VIIRS", 109, -4, 119, 4, 7, "VIIRS_SNPP_Thermal_Anomalies_375m_All", "500m")
print("--- India region (68-97.5E, 6-37.5N) ---")
region_test("MODIS", 68, 6, 97.5, 37.5, 6)
print("--- Global ---")
region_test("MODIS-global", -180, -85, 180, 85, 3)
region_test("MODIS-global", -180, -85, 180, 85, 4)
