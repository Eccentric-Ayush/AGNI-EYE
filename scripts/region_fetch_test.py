"""Test concurrent regional GIBS fire tile fetch: speed + point counts."""
import time
import gzip
import io
import urllib.request
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, '/home/z/my-project/scripts')
from mvt_probe import decode_tile_points

BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/{layer}/default/{date}/{tms}/{z}/{y}/{x}.mvt"

# Borneo region bbox: lon 109-119, lat -4 to 4
def bbox_tiles(west, south, east, north, z):
    """EPSG:4326 grid: zoom N -> 2^(N+1) cols x 2^N rows; tile = 360/2^(N+1) deg x 180/2^N deg"""
    cols = 2 ** (z + 1)
    rows = 2 ** z
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


def fetch(tile):
    z, y, x = tile
    url = BASE.format(layer="MODIS_Terra_Thermal_Anomalies_All", date="2026-09-05", tms="1km", z=z, y=y, x=x)
    try:
        req = urllib.request.Request(url, headers={"Accept-Encoding": "gzip"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
        if data[:2] == b'\x1f\x8b':
            data = gzip.decompress(data)
        return tile, data
    except urllib.error.HTTPError as e:
        if e.code in (400, 404):
            return tile, b''
        raise


t0 = time.time()
tiles = bbox_tiles(109, -4, 119, 4, 6)
print("tiles to fetch:", len(tiles))
total = 0
attrs_sample = None
errors = 0
with ThreadPoolExecutor(max_workers=12) as ex:
    for tile, data in ex.map(fetch, tiles):
        try:
            layers = decode_tile_points(data)
            for lname, feats in layers.items():
                total += len(feats)
                if feats and not attrs_sample:
                    attrs_sample = feats[0]
        except Exception as e:
            errors += 1
print(f"TOTAL POINTS: {total} in {time.time()-t0:.1f}s, errors: {errors}")
print("SAMPLE:", attrs_sample)
