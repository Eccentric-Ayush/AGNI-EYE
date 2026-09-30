import { NextRequest, NextResponse } from "next/server";
import { CLASS_IDS, type ClassId } from "@/lib/classify/types";
import { loadOr503, noSnapshotResponse, parseBbox, parseClasses, selectDates, snapshotAgeHours } from "@/lib/pipeline/query";
import type { HotspotListItem } from "@/lib/pipeline/types";
import { getAvailableDates, getMeta, pickDates, queryHotspots, tryDb } from "@/lib/store/postgres";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const MAX = 10000;

/** Classified, stored India hotspots. Reasons are served per hotspot by /api/hotspots/[id]. PostGIS first, files as fallback. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const classes = parseClasses(sp.get("classes"));
  const bbox = parseBbox(sp);
  const minFrp = parseFloat(sp.get("minFrp") ?? "") || 0;

  const fromDb = await tryDb(async () => {
    const [meta, available] = await Promise.all([getMeta(), getAvailableDates()]);
    const dates = pickDates(available, sp.get("date"), sp.get("days"));
    const [q, tri] = await Promise.all([
      queryHotspots({ dates, classes, bbox, minFrp, limit: MAX }),
      db.$queryRawUnsafe<Array<{ priority: string; n: bigint }>>(
        "select priority, count(*) as n from agni.triage_item where acq_date = ANY($1::date[]) group by 1",
        dates
      ),
    ]);
    const tn = (p: string) => Number(tri.find((t) => t.priority === p)?.n ?? 0);
    return {
      ok: true,
      store: "postgis",
      generatedAt: meta.generatedAt,
      ageHours: meta.ageHours,
      latestDate: meta.latestDate,
      dates,
      availableDates: available,
      classifierVersion: meta.classifierVersion,
      layers: meta.layers,
      totals: { raw: q.raw, classified: q.classified, byClass: q.byClass, needsAttention: tn("review"), watch: tn("watch") },
      truncated: q.truncated,
      features: q.features,
    };
  });
  if (fromDb) return NextResponse.json(fromDb);

  const snap = loadOr503();
  if (!snap) return noSnapshotResponse();
  const dates = new Set(selectDates(snap, sp));

  const byClass = Object.fromEntries(CLASS_IDS.map((c) => [c, 0])) as Record<ClassId, number>;
  let raw = 0;
  let classified = 0;
  const features: HotspotListItem[] = [];
  for (const h of snap.hotspots) {
    if (!dates.has(h.acqDate)) continue;
    if (bbox && (h.lat < bbox.south || h.lat > bbox.north || h.lon < bbox.west || h.lon > bbox.east)) continue;
    if (h.frp < minFrp) continue;
    raw++;
    byClass[h.class]++;
    if (h.class !== "unclassified") classified++;
    if (classes && !classes.has(h.class)) continue;
    features.push({
      id: h.id,
      lat: h.lat,
      lon: h.lon,
      acqDate: h.acqDate,
      acqTime: h.acqTime,
      frp: h.frp,
      class: h.class,
      subtype: h.subtype,
      confidence: h.confidence,
      source: h.source,
      siteName: h.site?.name ?? null,
      siteCategory: h.site?.category ?? null,
    });
  }
  features.sort((a, b) => b.frp - a.frp);
  const truncated = features.length > MAX;

  return NextResponse.json({
    ok: true,
    store: "files",
    generatedAt: snap.generatedAt,
    ageHours: snapshotAgeHours(snap),
    latestDate: snap.latestDate,
    dates: [...dates].sort(),
    availableDates: snap.hotspotDates,
    classifierVersion: snap.classifierVersion,
    layers: snap.layers,
    totals: {
      raw,
      classified,
      byClass,
      needsAttention: snap.triage.filter((t) => dates.has(t.acqDate) && t.priority === "review").length,
      watch: snap.triage.filter((t) => dates.has(t.acqDate) && t.priority === "watch").length,
    },
    truncated,
    features: truncated ? features.slice(0, MAX) : features,
  });
}
