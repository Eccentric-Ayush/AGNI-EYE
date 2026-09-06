import { NextRequest, NextResponse } from "next/server";
import { fetchSourceFires, type FireFeature, type GibsSource } from "@/lib/nasa/gibs";
import { fetchFirmsArea, firmsSourceParam } from "@/lib/nasa/firms";
import { aggregateStats, dedupeFeatures, isValidDate, parseSources, shiftDate, todayUtc } from "@/lib/nasa/registry";
import { cacheGetFresh, cacheGet, cacheSet, CACHE_TTL } from "@/lib/nasa/cache";
import { resolveFirmsMapKey } from "@/lib/nasa/settings";

export const dynamic = "force-dynamic";

interface FiresPayload {
  ok: boolean;
  backend: "gibs" | "firms";
  fellback: boolean;
  notice: string | null;
  cached: boolean;
  cacheAge: number;
  generatedAt: string;
  params: {
    sources: GibsSource[];
    bbox: { west: number; south: number; east: number; north: number };
    date: string;
    days: number;
    backend: string;
  };
  stats: ReturnType<typeof aggregateStats>;
  features: FireFeature[];
  meta: {
    tilesFetched: number;
    tilesFailed: number;
    zoom: number;
    truncated: boolean;
    fetchMs: number;
  };
}

function clampBbox(v: { west: string; south: string; east: string; north: string }) {
  const w = Math.max(-180, Math.min(180, parseFloat(v.west) || -180));
  const s = Math.max(-85, Math.min(85, parseFloat(v.south) || -85));
  const e = Math.max(-180, Math.min(180, parseFloat(v.east) || 180));
  const n = Math.max(-85, Math.min(85, parseFloat(v.north) || 85));
  return { west: w, south: s, east: e, north: n };
}

const MAX_FEATURES = 12000;

async function buildPayload(params: URLSearchParams): Promise<FiresPayload> {
  const t0 = Date.now();
  const sources = parseSources(params.get("sources"));
  const bbox = clampBbox({
    west: params.get("west") ?? "",
    south: params.get("south") ?? "",
    east: params.get("east") ?? "",
    north: params.get("north") ?? "",
  });
  const today = todayUtc();
  const dateParam = params.get("date");
  const date = dateParam && isValidDate(dateParam) && dateParam <= today ? dateParam : today;
  const days = Math.max(1, Math.min(7, parseInt(params.get("days") ?? "1", 10) || 1));
  const backend = params.get("backend") === "firms" ? "firms" : "gibs";
  const dayNight = params.get("dayNight"); // "D" | "N" | null (server-side pre-filter)
  const minFrp = parseFloat(params.get("minFrp") ?? "") || 0;

  const cacheKey = JSON.stringify({ sources, bbox, date, days, backend, dayNight, minFrp });
  const fresh = cacheGetFresh<FiresPayload>(cacheKey, CACHE_TTL.fires);
  if (fresh) {
    return { ...fresh.value, cached: true, cacheAge: Math.round(fresh.age / 1000) };
  }
  const stale = cacheGet<FiresPayload>(cacheKey);

  const dates: string[] = [];
  for (let i = 0; i < days; i++) dates.push(shiftDate(date, -i));

  let features: FireFeature[] = [];
  let tilesFetched = 0;
  let tilesFailed = 0;
  let zoom = 0;
  let usedBackend: "gibs" | "firms" = backend;
  let fellback = false;
  let notice: string | null = null;

  if (backend === "firms") {
    const mapKey = await resolveFirmsMapKey();
    if (!mapKey) {
      notice = "No FIRMS MAP_KEY configured — using GIBS live hotspot tiles instead (same FIRMS schema, no key needed).";
    } else {
      const res = await fetchFirmsArea({
        mapKey,
        sources: firmsSourceParam(sources),
        bbox,
        dayRange: days,
      });
      if (res.ok) {
        features = res.features;
        tilesFetched = 1;
      } else {
        fellback = true;
        notice = `FIRMS API: ${res.error} — automatically using GIBS live hotspot tiles.`;
      }
    }
  }

  if (usedBackend === "gibs" || fellback) {
    usedBackend = "gibs";
    const results = await Promise.all(
      sources.map(async (src) => {
        const perDate = await Promise.all(
          dates.map((d) => fetchSourceFires(src, bbox, d, { maxTiles: 64 }))
        );
        const merged = perDate.reduce(
          (acc, r) => {
            acc.features.push(...r.features);
            acc.tilesFetched += r.tilesFetched;
            acc.tilesFailed += r.tilesFailed;
            acc.zoom = Math.max(acc.zoom, r.zoom);
            return acc;
          },
          { features: [] as FireFeature[], tilesFetched: 0, tilesFailed: 0, zoom: 0 }
        );
        return merged;
      })
    );
    for (const r of results) {
      features.push(...r.features);
      tilesFetched += r.tilesFetched;
      tilesFailed += r.tilesFailed;
      zoom = Math.max(zoom, r.zoom);
    }
  }

  let deduped = dedupeFeatures(features);
  if (dayNight === "D" || dayNight === "N") deduped = deduped.filter((f) => f.properties.dayNight === dayNight);
  if (minFrp > 0) deduped = deduped.filter((f) => f.properties.frp >= minFrp);
  deduped.sort((a, b) => b.properties.frp - a.properties.frp);
  const truncated = deduped.length > MAX_FEATURES;
  const capped = truncated ? deduped.slice(0, MAX_FEATURES) : deduped;

  const payload: FiresPayload = {
    ok: true,
    backend: usedBackend,
    fellback,
    notice,
    cached: false,
    cacheAge: 0,
    generatedAt: new Date().toISOString(),
    params: { sources, bbox, date, days, backend: usedBackend },
    stats: aggregateStats(capped),
    features: capped,
    meta: { tilesFetched, tilesFailed, zoom, truncated, fetchMs: Date.now() - t0 },
  };
  cacheSet(cacheKey, payload);
  return payload;
}

export async function GET(req: NextRequest) {
  try {
    const payload = await buildPayload(req.nextUrl.searchParams);
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to fetch fire data" },
      { status: 500 }
    );
  }
}
