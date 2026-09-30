import { NextRequest, NextResponse } from "next/server";
import { CLASSIFIER_CONFIG } from "@/lib/classify/config";
import { classify, CLASSIFIER_VERSION, CLASS_LABELS } from "@/lib/classify";
import { loadOr503, noSnapshotResponse } from "@/lib/pipeline/query";
import type { ClassifiedHotspot } from "@/lib/pipeline/types";
import { getHotspotRow, getMeta, nearbyFacilities, tryDb } from "@/lib/store/postgres";

export const dynamic = "force-dynamic";

/** Full evidence for one hotspot: class, confidence, reasons (recomputed from stored inputs), links, nearby facilities (PostGIS). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  let h: ClassifiedHotspot | null = null;
  let store: "postgis" | "files" = "files";
  let snapshotVersion = "";
  let nearby: Awaited<ReturnType<typeof nearbyFacilities>> | null = null;

  const fromDb = await tryDb(async () => {
    const row = await getHotspotRow(id);
    if (!row) return { row: null as ClassifiedHotspot | null, version: "", nearby: null };
    const [meta, near] = await Promise.all([getMeta(), nearbyFacilities(row.lat, row.lon)]);
    return { row, version: meta.classifierVersion, nearby: near };
  });
  if (fromDb) {
    store = "postgis";
    h = fromDb.row;
    snapshotVersion = fromDb.version;
    nearby = fromDb.nearby;
    if (!h) return NextResponse.json({ ok: false, error: "Hotspot not found." }, { status: 404 });
  } else {
    const snap = loadOr503();
    if (!snap) return noSnapshotResponse();
    h = snap.hotspots.find((x) => x.id === id) ?? null;
    snapshotVersion = snap.classifierVersion;
    if (!h) return NextResponse.json({ ok: false, error: "Hotspot not found in the current snapshot." }, { status: 404 });
  }

  const res = classify(
    {
      lat: h.lat,
      lon: h.lon,
      frp: h.frp,
      brightness: h.brightness,
      brightT31: h.brightT31,
      dayNight: h.dayNight,
      acqDate: h.acqDate,
      acqTime: h.acqTime,
      instrument: "VIIRS",
      detectionConfidence: h.detectionConfidence,
    },
    {
      site: h.site
        ? { site: { id: h.site.id, name: h.site.name, category: h.site.category, lat: h.lat, lon: h.lon }, distanceM: h.site.distanceM }
        : null,
      history: { ...h.history, windowDays: CLASSIFIER_CONFIG.historyWindowDays },
      landCover: h.landCover,
    }
  );

  return NextResponse.json({
    ok: true,
    store,
    hotspot: h,
    classLabel: CLASS_LABELS[h.class],
    reasons: res.reasons,
    // Reasons are recomputed; flag drift if the stored data was built by a different classifier version.
    consistent: res.class === h.class && res.confidence === h.confidence,
    classifierVersion: { snapshot: snapshotVersion, current: CLASSIFIER_VERSION },
    // Mapped facilities near the hotspot by true geography distance (PostGIS). Includes ones outside the
    // classifier's match buffer, e.g. a plant OSM only maps as a single point.
    nearbyFacilities: nearby,
    links: {
      sentinelHub: `https://apps.sentinel-hub.com/eo-browser/?zoom=15&lat=${h.lat}&lng=${h.lon}`,
      firms: `https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${h.lon},${h.lat},13.0z`,
      osm: `https://www.openstreetmap.org/?mlat=${h.lat}&mlon=${h.lon}#map=16/${h.lat}/${h.lon}`,
    },
  });
}
