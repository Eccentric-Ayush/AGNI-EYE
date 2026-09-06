import { NextResponse } from "next/server";
import { fetchSourceFires } from "@/lib/nasa/gibs";
import { fetchEonetWildfires } from "@/lib/nasa/eonet";
import { cacheGetFresh, cacheSet, CACHE_TTL } from "@/lib/nasa/cache";
import { resolveFirmsMapKey } from "@/lib/nasa/settings";
import { fetchWithTimeout } from "@/lib/nasa/firms";
import { todayUtc } from "@/lib/nasa/registry";

export const dynamic = "force-dynamic";

/**
 * Live health of every real NASA data source this app uses.
 */
export async function GET() {
  const fresh = cacheGetFresh("sources-status", CACHE_TTL.status);
  if (fresh) {
    return NextResponse.json({ ...fresh.value, cached: true });
  }

  const today = todayUtc();

  // 1. GIBS hotspot vector tiles: fetch one small, usually-fire-active tile
  let gibs: { ok: boolean; detail: string; latencyMs: number } = {
    ok: false,
    detail: "no data",
    latencyMs: 0,
  };
  try {
    const t0 = Date.now();
    const r = await fetchSourceFires("viirs_snpp", { west: 100, south: -5, east: 120, north: 5 }, today, {
      maxTiles: 1,
      timeoutMs: 8000,
    });
    const latency = Date.now() - t0;
    gibs = {
      ok: r.tilesFetched > 0,
      detail: r.tilesFetched > 0 ? `${r.features.length} hotspots in probe tile` : "tile fetch failed",
      latencyMs: latency,
    };
  } catch (e) {
    gibs = { ok: false, detail: e instanceof Error ? e.message : "error", latencyMs: 0 };
  }

  // 2. EONET
  let eonet: { ok: boolean; detail: string; latencyMs: number } = { ok: false, detail: "no data", latencyMs: 0 };
  try {
    const t0 = Date.now();
    const r = await fetchEonetWildfires({ status: "open", days: 30, limit: 5, timeoutMs: 8000 });
    eonet = {
      ok: r.ok,
      detail: r.ok ? `${r.events.length} live wildfire events` : r.error ?? "error",
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    eonet = { ok: false, detail: e instanceof Error ? e.message : "error", latencyMs: 0 };
  }

  // 3. FIRMS API (needs MAP_KEY; may be unreachable from some hosts)
  const mapKey = await resolveFirmsMapKey();
  let firms: { ok: boolean; configured: boolean; reachable: boolean; detail: string; latencyMs: number } = {
    ok: false,
    configured: Boolean(mapKey),
    reachable: false,
    detail: mapKey ? "MAP_KEY configured, not probed" : "no MAP_KEY configured (free at firms.modaps.eosdis.nasa.gov/api/map_key/)",
    latencyMs: 0,
  };
  if (mapKey) {
    try {
      const t0 = Date.now();
      const res = await fetchWithTimeout(
        `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(mapKey)}/viirs_snpp_24h/100,-5,105,0/1`,
        8000
      );
      const text = (await res.text()).slice(0, 100);
      firms = {
        ok: res.ok && !/^INVALID/i.test(text),
        configured: true,
        reachable: true,
        detail: res.ok ? `reachable (HTTP ${res.status})` : `HTTP ${res.status}`,
        latencyMs: Date.now() - t0,
      };
    } catch {
      firms = {
        ok: false,
        configured: true,
        reachable: false,
        detail: "unreachable from this server — GIBS pipeline covers hotspot data",
        latencyMs: 0,
      };
    }
  }

  // 4. GIBS true-color imagery (basemap sanity)
  let imagery: { ok: boolean; detail: string; latencyMs: number } = { ok: false, detail: "not probed", latencyMs: 0 };
  try {
    const t0 = Date.now();
    const res = await fetchWithTimeout(
      `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${today}/GoogleMapsCompatible_Level9/4/6/12.jpg`,
      8000
    );
    imagery = { ok: res.ok, detail: res.ok ? "true-color imagery serving" : `HTTP ${res.status}`, latencyMs: Date.now() - t0 };
  } catch (e) {
    imagery = { ok: false, detail: e instanceof Error ? e.message : "error", latencyMs: 0 };
  }

  const payload = {
    ok: gibs.ok && eonet.ok,
    checkedAt: new Date().toISOString(),
    sources: {
      gibsHotspots: { name: "GIBS Fire Hotspot Vector Tiles", realtime: true, keyRequired: false, ...gibs },
      eonet: { name: "NASA EONET Wildfire Events", realtime: true, keyRequired: false, ...eonet },
      firmsApi: { name: "FIRMS Area CSV API", realtime: true, keyRequired: true, ...firms },
      gibsImagery: { name: "GIBS VIIRS True-Color Imagery", realtime: true, keyRequired: false, ...imagery },
    },
  };
  cacheSet("sources-status", payload);
  return NextResponse.json(payload);
}
