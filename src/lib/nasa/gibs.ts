/**
 * NASA GIBS fire hotspot data client.
 *
 * NASA GIBS publishes FIRMS-style active fire/thermal anomaly detections as
 * Mapbox Vector Tiles (MVT) — REAL LIVE satellite data, no API key required.
 *
 *   https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/{LAYER}/default/{DATE}/{TMS}/{Z}/{Y}/{X}.mvt
 *
 * Layers (verified from GIBS WMTS capabilities):
 *   MODIS  Terra/Aqua/Combined  -> TileMatrixSet "1km",  zooms 0..6
 *   VIIRS  SNPP/NOAA20/NOAA21   -> TileMatrixSet "500m", zooms 0..7
 *
 * EPSG:4326 tile grids are GIBS-CUSTOM (NOT the standard 2^(z+1) x 2^z):
 *   z0=2x1, z1=3x2, z2=5x3, z3=10x5, z4=20x10, z5=40x20, z6=80x40, z7=160x80
 * tile width = 360/cols, height = 180/rows; col 0 starts at -180, row 0 at +90.
 *
 * MVT attributes (FIRMS schema): LATITUDE, LONGITUDE, BRIGHTNESS, BRIGHT_T31,
 * FRP, SCAN, TRACK, ACQ_DATE, ACQ_TIME, SATELLITE, INSTRUMENT, CONFIDENCE,
 * VERSION, DAYNIGHT, UID.
 */

import zlib from "node:zlib";

export type GibsSource =
  | "viirs_snpp"
  | "viirs_noaa20"
  | "viirs_noaa21"
  | "modis_terra"
  | "modis_aqua"
  | "modis_combined";

interface LayerDef {
  layer: string;
  tms: "1km" | "500m";
  maxZoom: number;
  instrument: string;
}

export const GIBS_LAYERS: Record<GibsSource, LayerDef> = {
  viirs_snpp: { layer: "VIIRS_SNPP_Thermal_Anomalies_375m_All", tms: "500m", maxZoom: 7, instrument: "VIIRS" },
  viirs_noaa20: { layer: "VIIRS_NOAA20_Thermal_Anomalies_375m_All", tms: "500m", maxZoom: 7, instrument: "VIIRS" },
  viirs_noaa21: { layer: "VIIRS_NOAA21_Thermal_Anomalies_375m_All", tms: "500m", maxZoom: 7, instrument: "VIIRS" },
  modis_terra: { layer: "MODIS_Terra_Thermal_Anomalies_All", tms: "1km", maxZoom: 6, instrument: "MODIS" },
  modis_aqua: { layer: "MODIS_Aqua_Thermal_Anomalies_All", tms: "1km", maxZoom: 6, instrument: "MODIS" },
  modis_combined: { layer: "MODIS_Combined_Thermal_Anomalies_All", tms: "1km", maxZoom: 6, instrument: "MODIS" },
};

/** GIBS EPSG:4326 grid dimensions per zoom (cols x rows). */
const GRIDS: Record<string, Array<[number, number]>> = {
  "1km": [
    [2, 1],
    [3, 2],
    [5, 3],
    [10, 5],
    [20, 10],
    [40, 20],
    [80, 40],
  ],
  "500m": [
    [2, 1],
    [3, 2],
    [5, 3],
    [10, 5],
    [20, 10],
    [40, 20],
    [80, 40],
    [160, 80],
  ],
};

export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface FireProps {
  source: GibsSource;
  instrument: string;
  satellite: string;
  latitude: number;
  longitude: number;
  brightness: number;
  brightT31: number | null;
  frp: number;
  scan: number | null;
  track: number | null;
  acqDate: string;
  acqTime: string;
  dayNight: "D" | "N";
  confidence: number | null;
  version: string | null;
}

export interface FireFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: FireProps;
}

/* ------------------------------------------------------------------ */
/* Tile math                                                           */
/* ------------------------------------------------------------------ */

/** Tiles (z,y,x) covering a bbox at the given zoom for a GIBS TMS. */
export function bboxTiles(bbox: Bbox, z: number, tms: "1km" | "500m"): Array<[number, number, number]> {
  const grid = GRIDS[tms];
  const [cols, rows] = grid[Math.min(z, grid.length - 1)];
  const tw = 360 / cols;
  const th = 180 / rows;
  const west = Math.max(-180, Math.min(bbox.west, 179.999));
  const east = Math.max(-179.999, Math.min(bbox.east, 180));
  const south = Math.max(-90, Math.min(bbox.south, 89.999));
  const north = Math.max(-89.999, Math.min(bbox.north, 90));
  const x0 = Math.floor((west + 180) / tw);
  const x1 = Math.floor((east + 180) / tw);
  const y0 = Math.floor((90 - north) / th);
  const y1 = Math.floor((90 - south) / th);
  const tiles: Array<[number, number, number]> = [];
  for (let x = Math.max(0, x0); x <= Math.min(cols - 1, x1); x++) {
    for (let y = Math.max(0, y0); y <= Math.min(rows - 1, y1); y++) {
      tiles.push([z, y, x]);
    }
  }
  return tiles;
}

/** Pick the highest zoom whose tile count stays under maxTiles. */
export function pickZoom(bbox: Bbox, tms: "1km" | "500m", maxZoom: number, maxTiles = 64): number {
  for (let z = maxZoom; z >= 0; z--) {
    if (bboxTiles(bbox, z, tms).length <= maxTiles) return z;
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* MVT decoding (Mapbox Vector Tile, points only)                      */
/* ------------------------------------------------------------------ */

function readVarint(buf: Buffer, pos: { i: number }): number {
  let result = 0;
  let shift = 0;
  while (true) {
    if (pos.i >= buf.length) throw new Error("varint out of range");
    const b = buf[pos.i++];
    result += (b & 0x7f) * Math.pow(2, shift);
    if ((b & 0x80) === 0) break;
    shift += 7;
    if (shift > 63) throw new Error("varint too long");
  }
  return result;
}

function zigzag(n: number): number {
  return (n >>> 1) ^ -(n & 1);
}

function decodeValue(buf: Buffer): string | number | boolean | null {
  const pos = { i: 0 };
  let val: string | number | boolean | null = null;
  try {
    while (pos.i < buf.length) {
      const tag = readVarint(buf, pos);
      const field = tag >> 3;
      const wire = tag & 7;
      if (wire === 0) {
        const v = readVarint(buf, pos);
        if (field === 1) val = v === 1;
        else if (field === 2 || field === 5) val = v;
        else if (field === 3) val = zigzag(v);
      } else if (wire === 5) {
        val = buf.readFloatLE(pos.i);
        pos.i += 4;
      } else if (wire === 1) {
        val = buf.readDoubleLE(pos.i);
        pos.i += 8;
      } else if (wire === 2) {
        const len = readVarint(buf, pos);
        val = buf.slice(pos.i, pos.i + len).toString("utf8");
        pos.i += len;
      } else {
        break;
      }
    }
  } catch {
    /* best-effort */
  }
  return val;
}

interface RawFeature {
  attrs: Record<string, string | number | boolean | null>;
  x: number;
  y: number;
}

function decodeGeometry(payload: Buffer): { count: number; x: number; y: number } {
  const gp = { i: 0 };
  let cx = 0;
  let cy = 0;
  let count = 0;
  let firstX = 0;
  let firstY = 0;
  while (gp.i < payload.length) {
    const cmd = readVarint(payload, gp);
    const cmdId = cmd & 7;
    const cnt = cmd >> 3;
    if (cmdId === 1 || cmdId === 2) {
      for (let n = 0; n < cnt && gp.i < payload.length; n++) {
        cx += zigzag(readVarint(payload, gp));
        cy += zigzag(readVarint(payload, gp));
        count++;
        if (count === 1) {
          firstX = cx;
          firstY = cy;
        }
      }
    } else if (cmdId === 7) {
      /* ClosePath */
    } else {
      break;
    }
  }
  return { count, x: firstX, y: firstY };
}

function decodeLayer(buf: Buffer, extent: number): RawFeature[] {
  const pos = { i: 0 };
  const keys: string[] = [];
  const values: Array<string | number | boolean | null> = [];
  const featureBufs: Buffer[] = [];
  while (pos.i < buf.length) {
    const tag = readVarint(buf, pos);
    const field = tag >> 3;
    const wire = tag & 7;
    if (wire === 2) {
      const len = readVarint(buf, pos);
      const payload = buf.slice(pos.i, pos.i + len);
      pos.i += len;
      if (field === 2) featureBufs.push(payload);
      else if (field === 3) keys.push(payload.toString("utf8"));
      else if (field === 4) values.push(decodeValue(payload));
    } else if (wire === 0) {
      readVarint(buf, pos);
    } else {
      break;
    }
  }
  const out: RawFeature[] = [];
  for (const fb of featureBufs) {
    const fpos = { i: 0 };
    let geomType = 0;
    let geom: Buffer | null = null;
    const tags: number[] = [];
    while (fpos.i < fb.length) {
      const tag = readVarint(fb, fpos);
      const field = tag >> 3;
      const wire = tag & 7;
      if (wire === 0) {
        const v = readVarint(fb, fpos);
        if (field === 3) geomType = v;
      } else if (wire === 2) {
        const len = readVarint(fb, fpos);
        const payload = fb.slice(fpos.i, fpos.i + len);
        fpos.i += len;
        if (field === 2) {
          const tp = { i: 0 };
          while (tp.i < payload.length) {
            tags.push(readVarint(payload, tp));
            tags.push(readVarint(payload, tp));
          }
        } else if (field === 4) {
          geom = payload;
        }
      } else if (wire === 1) {
        fpos.i += 8;
      } else if (wire === 5) {
        fpos.i += 4;
      } else {
        break;
      }
    }
    if (geomType !== 1 || !geom) continue; // POINT features only
    const g = decodeGeometry(geom);
    if (g.count === 0) continue;
    const attrs: Record<string, string | number | boolean | null> = {};
    for (let i = 0; i + 1 < tags.length; i += 2) {
      const k = keys[tags[i]];
      const v = values[tags[i + 1]];
      if (k !== undefined) attrs[k] = v ?? null;
    }
    out.push({
      attrs,
      x: (g.x / extent) * 360 - 180,
      y: 90 - (g.y / extent) * 180,
    });
  }
  return out;
}

/** Decode a (possibly gzip-compressed) MVT buffer into point features. */
export function decodeMvtPoints(buf: Buffer, extent = 4096): RawFeature[] {
  let data = buf;
  if (data.length > 2 && data[0] === 0x1f && data[1] === 0x8b) {
    try {
      data = zlib.gunzipSync(data);
    } catch {
      return [];
    }
  }
  const out: RawFeature[] = [];
  const pos = { i: 0 };
  try {
    while (pos.i < data.length) {
      const tag = readVarint(data, pos);
      const field = tag >> 3;
      const wire = tag & 7;
      if (wire === 2) {
        const len = readVarint(data, pos);
        const payload = data.slice(pos.i, pos.i + len);
        pos.i += len;
        if (field === 3) out.push(...decodeLayer(payload, extent));
      } else if (wire === 0) {
        readVarint(data, pos);
      } else {
        break;
      }
    }
  } catch {
    /* best-effort: return what we have */
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Tile fetching                                                       */
/* ------------------------------------------------------------------ */

const TILE_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/{layer}/default/{date}/{tms}/{z}/{y}/{x}.mvt";

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "AgniEyeCommand/2.0 (NASA data client)" },
      cache: "no-store",
    });
  } finally {
    clearTimeout(t);
  }
}

/** Run async jobs with bounded concurrency, preserving order. */
async function pooled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

function num(v: string | number | boolean | null | undefined): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: string | number | boolean | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

/** Fetch + decode every tile for a source/bbox/date into FireFeatures. */
export async function fetchSourceFires(
  source: GibsSource,
  bbox: Bbox,
  date: string,
  opts?: { maxTiles?: number; timeoutMs?: number }
): Promise<{ features: FireFeature[]; tilesFetched: number; tilesFailed: number; zoom: number }> {
  const def = GIBS_LAYERS[source];
  const maxTiles = opts?.maxTiles ?? 64;
  const z = pickZoom(bbox, def.tms, def.maxZoom, maxTiles);
  const tiles = bboxTiles(bbox, z, def.tms);
  let tilesFailed = 0;
  const raw: RawFeature[] = [];

  await pooled(tiles, 10, async (t) => {
    const [zz, y, x] = t;
    const url = TILE_URL.replace("{layer}", def.layer)
      .replace("{date}", date)
      .replace("{tms}", def.tms)
      .replace("{z}", String(zz))
      .replace("{y}", String(y))
      .replace("{x}", String(x));
    try {
      const res = await fetchWithTimeout(url, opts?.timeoutMs ?? 15000);
      if (!res.ok) {
        tilesFailed++;
        return;
      }
      const ab = await res.arrayBuffer();
      const buf = Buffer.from(ab);
      if (buf.length === 0) return;
      raw.push(...decodeMvtPoints(buf));
    } catch {
      tilesFailed++;
    }
  });

  // GIBS low-zoom tiles may be clustered, but LATITUDE/LONGITUDE attrs hold
  // original coordinates — authoritative. Tile-local position is the fallback.
  const features: FireFeature[] = [];
  for (const r of raw) {
    const lat = num(r.attrs.LATITUDE) ?? r.y;
    const lon = num(r.attrs.LONGITUDE) ?? r.x;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    const dn = str(r.attrs.DAYNIGHT);
    const acqDate = str(r.attrs.ACQ_DATE) ?? date;
    const acqTime = str(r.attrs.ACQ_TIME) ?? "00:00";
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        source,
        instrument: str(r.attrs.INSTRUMENT) ?? def.instrument,
        satellite: str(r.attrs.SATELLITE) ?? source,
        latitude: lat,
        longitude: lon,
        brightness: num(r.attrs.BRIGHTNESS) ?? 0,
        brightT31: num(r.attrs.BRIGHT_T31),
        frp: num(r.attrs.FRP) ?? 0,
        scan: num(r.attrs.SCAN),
        track: num(r.attrs.TRACK),
        acqDate,
        acqTime,
        dayNight: dn === "N" ? "N" : "D",
        confidence: num(r.attrs.CONFIDENCE),
        version: str(r.attrs.VERSION),
      },
    });
  }
  return { features, tilesFetched: tiles.length - tilesFailed, tilesFailed, zoom: z };
}
