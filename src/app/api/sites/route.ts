import { NextRequest, NextResponse } from "next/server";
import { CLASS_LABELS } from "@/lib/classify/types";
import { csvEscape, loadOr503, noSnapshotResponse, parseClasses } from "@/lib/pipeline/query";
import type { PersistentSource } from "@/lib/pipeline/types";
import { getMeta, querySources, tryDb } from "@/lib/store/postgres";

export const dynamic = "force-dynamic";

/**
 * Persistent-thermal-source register. `?format=csv` or `?format=geojson` for GIS export.
 * `?classes=industrial_persistent,other_static` filters by class. PostGIS first, files as fallback.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const classes = parseClasses(sp.get("classes"));
  const format = sp.get("format");

  let rows: PersistentSource[];
  let latestDate: string;
  let generatedAt: string;
  let classifierVersion: string;
  let store: "postgis" | "files" = "files";

  const fromDb = await tryDb(async () => {
    const [q, meta] = await Promise.all([querySources(classes), getMeta()]);
    return { q, meta };
  });
  if (fromDb) {
    store = "postgis";
    rows = fromDb.q.sources;
    latestDate = fromDb.meta.latestDate;
    generatedAt = fromDb.meta.generatedAt;
    classifierVersion = fromDb.meta.classifierVersion;
  } else {
    const snap = loadOr503();
    if (!snap) return noSnapshotResponse();
    rows = snap.sources.filter((s) => !classes || classes.has(s.class));
    latestDate = snap.latestDate;
    generatedAt = snap.generatedAt;
    classifierVersion = snap.classifierVersion;
  }

  if (format === "csv") {
    const head = ["id", "lat", "lon", "class", "subtype", "confidence", "site_name", "site_category", "days_active", "window_days", "first_seen", "last_seen", "frp_median_mw", "frp_p90_mw", "last_frp_mw", "detections", "land_cover"];
    const lines = [head.join(",")].concat(
      rows.map((s) =>
        [s.id, s.lat, s.lon, s.class, s.subtype, s.confidence, s.siteName, s.siteCategory, s.daysActive, s.windowDays, s.firstSeen, s.lastSeen, s.frpMedian, s.frpP90, s.lastFrp, s.detections, s.landCover]
          .map(csvEscape)
          .join(",")
      )
    );
    return new NextResponse(lines.join("\n") + "\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="agni-eye-persistent-sources-${latestDate}.csv"`,
      },
    });
  }

  if (format === "geojson") {
    const fc = {
      type: "FeatureCollection",
      name: "agni-eye-persistent-sources",
      properties: { latestDate, classifierVersion, generatedAt, store },
      features: rows.map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        properties: { ...s, classLabel: CLASS_LABELS[s.class] },
      })),
    };
    return new NextResponse(JSON.stringify(fc), {
      headers: {
        "Content-Type": "application/geo+json",
        "Content-Disposition": `attachment; filename="agni-eye-persistent-sources-${latestDate}.geojson"`,
      },
    });
  }

  return NextResponse.json({ ok: true, store, latestDate, generatedAt, count: rows.length, sources: rows });
}
