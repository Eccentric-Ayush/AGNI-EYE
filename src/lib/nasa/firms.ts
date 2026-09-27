/**
 * NASA FIRMS area CSV API client (https://firms.modaps.eosdis.nasa.gov).
 *
 * FIRMS requires a free MAP_KEY (https://firms.modaps.eosdis.nasa.gov/api/map_key/).
 * The key is stored in the app database (Setting table) or env FIRMS_MAP_KEY.
 * Some hosting environments block outbound access to firms.modaps.eosdis.nasa.gov;
 * in that case this client reports unreachable and the app falls back to the
 * GIBS vector-tile pipeline (same FIRMS schema, no key needed).
 */

import type { FireFeature } from "./gibs";
import type { GibsSource } from "./gibs";

const FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api";

const SOURCE_TO_FIRMS: Record<GibsSource, string> = {
  viirs_snpp: "viirs_snpp_24h",
  viirs_noaa20: "viirs_noaa20_24h",
  viirs_noaa21: "viirs_noaa21_24h",
  modis_terra: "modis_nrt_terra", // placeholder mapping; "all" used instead
  modis_aqua: "modis_nrt_aqua",
  modis_combined: "modis_24h",
};

/** FIRMS area API only accepts these source strings. */
export function firmsSourceParam(sources: GibsSource[]): string {
  if (sources.length === 0 || sources.length >= 5) return "all";
  return sources.map((s) => SOURCE_TO_FIRMS[s]).join(",");
}

export async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
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

export interface FirmsAreaParams {
  mapKey: string;
  sources: string; // e.g. "all" | "viirs_snpp_24h" | comma list
  bbox: { west: number; south: number; east: number; north: number };
  dayRange: number; // 1..10
  date?: string; // YYYY-MM-DD (only valid for dayRange=1..2 style queries)
}

export interface FirmsResult {
  ok: boolean;
  reachable: boolean;
  features: FireFeature[];
  error?: string;
  raw?: string;
}

/**
 * Query the FIRMS area CSV endpoint. Returns parsed features or a clear error.
 */
export async function fetchFirmsArea(p: FirmsAreaParams, timeoutMs = 12000): Promise<FirmsResult> {
  const { mapKey, sources, bbox, dayRange } = p;
  const west = bbox.west.toFixed(4);
  const south = bbox.south.toFixed(4);
  const east = bbox.east.toFixed(4);
  const north = bbox.north.toFixed(4);
  let url = `${FIRMS_BASE}/area/csv/${encodeURIComponent(mapKey)}/${sources}/${west},${south},${east},${north}/${dayRange}`;
  if (p.date) url += `/${p.date}`;

  try {
    const res = await fetchWithTimeout(url, timeoutMs);
    const text = await res.text();
    if (res.status === 403 || /invalid|invalid_map_key/i.test(text.slice(0, 200))) {
      return { ok: false, reachable: true, features: [], error: "FIRMS rejected the MAP_KEY (invalid or inactive)." };
    }
    if (!res.ok) {
      return { ok: false, reachable: true, features: [], error: `FIRMS HTTP ${res.status}` };
    }
    if (!text.trim()) {
      return { ok: false, reachable: true, features: [], error: "FIRMS returned an empty response." };
    }
    if (/^INVALID/i.test(text.trim())) {
      return { ok: false, reachable: true, features: [], error: "FIRMS MAP_KEY is invalid." };
    }
    const features = parseFirmsCsv(text);
    return { ok: true, reachable: true, features };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "AbortError" ? "FIRMS API is unreachable from this server (connection timed out)." : e.message) : "network error";
    return { ok: false, reachable: false, features: [], error: msg };
  }
}

/**
 * Parse the FIRMS area CSV format:
 * latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
 */
export function parseFirmsCsv(csv: string): FireFeature[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iLat = idx("latitude");
  const iLon = idx("longitude");
  if (iLat < 0 || iLon < 0) return [];
  const iB = idx("brightness");
  const iScan = idx("scan");
  const iTrack = idx("track");
  const iDate = idx("acq_date");
  const iTime = idx("acq_time");
  const iSat = idx("satellite");
  const iInst = idx("instrument");
  const iConf = idx("confidence");
  const iVer = idx("version");
  const iBT31 = idx("bright_t31");
  const iFrp = idx("frp");
  const iDN = idx("daynight");

  const out: FireFeature[] = [];
  for (let li = 1; li < lines.length; li++) {
    const parts = lines[li].split(",");
    if (parts.length < header.length) continue;
    const lat = parseFloat(parts[iLat]);
    const lon = parseFloat(parts[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const satellite = (parts[iSat] ?? "").trim();
    const instrument = (parts[iInst] ?? "").trim();
    let source: GibsSource = "modis_combined";
    if (/noaa-?20|j1/i.test(satellite)) source = "viirs_noaa20";
    else if (/noaa-?21|j2/i.test(satellite)) source = "viirs_noaa21";
    else if (/suomi|npp|snpp/i.test(satellite)) source = "viirs_snpp";
    else if (/terra/i.test(satellite)) source = "modis_terra";
    else if (/aqua/i.test(satellite)) source = "modis_aqua";
    const rawConf = (parts[iConf] ?? "").trim();
    const conf = rawConf === "" ? null : rawConf.match(/^\d+$/) ? parseInt(rawConf, 10) : rawConf === "h" ? 90 : rawConf === "l" ? 10 : rawConf === "n" ? 50 : null;
    const rawTime = (parts[iTime] ?? "").trim();
    const hh = rawTime.padStart(4, "0").slice(0, 2);
    const mm = rawTime.padStart(4, "0").slice(2, 4);
    out.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        source,
        instrument: instrument || "unknown",
        satellite: satellite || "unknown",
        latitude: lat,
        longitude: lon,
        brightness: parseFloat(parts[iB]) || 0,
        brightT31: parts[iBT31] ? parseFloat(parts[iBT31]) : null,
        frp: parts[iFrp] ? parseFloat(parts[iFrp]) : 0,
        scan: parts[iScan] ? parseFloat(parts[iScan]) : null,
        track: parts[iTrack] ? parseFloat(parts[iTrack]) : null,
        acqDate: (parts[iDate] ?? "").trim(),
        acqTime: `${hh}:${mm}`,
        dayNight: (parts[iDN] ?? "D").trim() === "N" ? "N" : "D",
        confidence: conf,
        version: (parts[iVer] ?? "").trim() || null,
      },
    });
  }
  return out;
}
