/**
 * Cross-check the PostGIS store against the file snapshot it was loaded from.
 * Usage: npm run db:verify   (exit code 1 on any mismatch)
 */
import { CLASS_IDS } from "../src/lib/classify/types";
import { readSnapshot } from "../src/lib/pipeline/snapshot-store";
import { loadSites } from "../src/lib/pipeline/sites";
import { getAvailableDates, getMeta, getStoreCounts, nearbyFacilities, pickDates, queryHotspots, queryIndustrialLayer, querySources, queryTriage } from "../src/lib/store/postgres";
import { db } from "../src/lib/db";

let failed = 0;
function check(label: string, a: unknown, b: unknown) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n   db:    ${JSON.stringify(a)}\n   files: ${JSON.stringify(b)}`}`);
}

async function main() {
  const snap = readSnapshot();
  if (!snap) throw new Error("no snapshot file to compare against");
  const meta = await getMeta();
  check("classifier version", meta.classifierVersion, snap.classifierVersion);
  check("latest date", meta.latestDate, snap.latestDate);

  const available = await getAvailableDates();
  check("stored dates cover snapshot dates", snap.hotspotDates.every((d) => available.includes(d)), true);

  for (const days of [1, 3]) {
    const dates = pickDates(snap.hotspotDates, null, String(days));
    const q = await queryHotspots({ dates, classes: null, bbox: null, minFrp: 0, limit: 100000 });
    const set = new Set(dates);
    const fileHs = snap.hotspots.filter((h) => set.has(h.acqDate));
    const fileBy = Object.fromEntries(CLASS_IDS.map((c) => [c, fileHs.filter((h) => h.class === c).length]));
    check(`days=${days}: raw total`, q.raw, fileHs.length);
    check(`days=${days}: per-class counts`, q.byClass, fileBy);
    check(`days=${days}: classified`, q.classified, fileHs.filter((h) => h.class !== "unclassified").length);
  }

  // filters
  const dates1 = pickDates(snap.hotspotDates, null, "1");
  const bbox = { west: 84, south: 21, east: 87, north: 24 };
  const qb = await queryHotspots({ dates: dates1, classes: null, bbox, minFrp: 5, limit: 100000 });
  const fb = snap.hotspots.filter((h) => h.acqDate === dates1[0] && h.frp >= 5 && h.lat >= 21 && h.lat <= 24 && h.lon >= 84 && h.lon <= 87);
  check("bbox + minFrp filter count", qb.raw, fb.length);
  const qc = await queryHotspots({ dates: dates1, classes: new Set(["industrial_anomaly"]), bbox: null, minFrp: 0, limit: 100000 });
  check("class filter returns only that class", qc.features.every((f) => f.class === "industrial_anomaly"), true);

  // triage
  const tri = await queryTriage(snap.hotspotDates);
  const t = (arr: { key: string; priority: string; frp: number }[]) => arr.map((x) => `${x.key}:${x.priority}:${x.frp}`).sort();
  check("triage items (key, priority, frp)", t(tri), t(snap.triage));

  // register
  const src = await querySources(null);
  check("register count", src.sources.length, snap.sources.length);
  check("register order & ids", src.sources.slice(0, 20).map((s) => s.id).sort(), [...snap.sources].slice(0, 20).map((s) => s.id).sort());

  // industrial layer
  const sites = loadSites();
  const counts = await getStoreCounts();
  check("industrial site count", Number((await db.$queryRawUnsafe<Array<{ n: bigint }>>("select count(*) as n from agni.industrial_site"))[0].n), sites.sites.length);
  const box = { west: 84.5, south: 21.7, east: 85.5, north: 22.7 };
  const layer = await queryIndustrialLayer(box, undefined, 100000);
  check("industrial layer bbox count (centroid in box vs geometry overlaps box)", layer.matched >= sites.sites.filter((s) => s.lat >= box.south && s.lat <= box.north && s.lon >= box.west && s.lon <= box.east).length, true);

  // PostGIS-only capability: true-distance neighbours
  const near = await nearbyFacilities(22.2094, 84.8611, 2000, 5);
  console.log("INFO  nearby facilities to a Rourkela persistent hotspot:", near.map((n) => `${n.name ?? n.category} ${n.distanceM}m`).join(" | ") || "none");
  console.log("INFO  store counts:", JSON.stringify(counts));

  console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(String(e instanceof Error ? e.message : e).replace(/postgres(ql)?:\/\/\S+/g, "<url>"));
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
