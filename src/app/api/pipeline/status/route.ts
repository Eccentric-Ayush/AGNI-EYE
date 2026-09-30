import { NextResponse } from "next/server";
import { readSnapshot } from "@/lib/pipeline/snapshot-store";
import { loadSites } from "@/lib/pipeline/sites";
import { snapshotAgeHours } from "@/lib/pipeline/query";
import { getAvailableDates, getMeta, getStoreCounts, tryDb } from "@/lib/store/postgres";

export const dynamic = "force-dynamic";

/** Health of the classification pipeline: what data the UI is actually showing, from which store, and how old it is. */
export async function GET() {
  const fromDb = await tryDb(async () => {
    const [meta, counts, available] = await Promise.all([getMeta(), getStoreCounts(), getAvailableDates()]);
    return { meta, counts, available };
  });
  if (fromDb) {
    const { meta, counts, available } = fromDb;
    return NextResponse.json({
      ok: true,
      store: "postgis",
      snapshot: {
        generatedAt: meta.generatedAt,
        ageHours: meta.ageHours,
        latestDate: meta.latestDate,
        observedDays: meta.observedDates.length,
        classifierVersion: meta.classifierVersion,
        hotspots: counts.hotspots,
        storedDates: available.length,
        persistentSources: counts.persistentSources,
        triageItems: counts.triageItems,
        triageOpen: counts.triageOpen,
        triageAck: counts.triageAck,
        triageDismissed: counts.triageDismissed,
        // "live" = ingested within the last 12 h; otherwise the UI must say the data is archived.
        freshness: meta.ageHours <= 12 ? "live" : "archived",
      },
      layers: meta.layers,
      industrialLayer: { available: true, ...meta.layers.industrialSites },
    });
  }

  const snap = readSnapshot();
  const sites = loadSites();
  if (!snap) {
    return NextResponse.json({ ok: true, store: "files", snapshot: null, industrialLayer: { available: sites.available, ...sites.meta } });
  }
  const age = snapshotAgeHours(snap);
  return NextResponse.json({
    ok: true,
    store: "files",
    snapshot: {
      generatedAt: snap.generatedAt,
      ageHours: age,
      latestDate: snap.latestDate,
      observedDays: snap.observedDates.length,
      classifierVersion: snap.classifierVersion,
      hotspots: snap.hotspots.length,
      persistentSources: snap.sources.length,
      triageItems: snap.triage.length,
      freshness: age <= 12 ? "live" : "archived",
    },
    layers: snap.layers,
    industrialLayer: { available: sites.available, ...sites.meta },
  });
}
