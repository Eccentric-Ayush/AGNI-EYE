/**
 * Classify the stored raw detections and write data/snapshot/latest.json.gz.
 * Usage: npm run build:snapshot -- [--hotspot-days 3] [--no-landcover]
 */
import { inIndia, loadIndiaRings } from "../src/lib/geo/boundary";
import { buildSnapshot } from "../src/lib/pipeline/build";
import { listRawDates, readRawDay, VIIRS_SOURCES, type RawDay } from "../src/lib/pipeline/raw-store";
import { loadSites } from "../src/lib/pipeline/sites";
import { writeSnapshot, snapshotPath } from "../src/lib/pipeline/snapshot-store";
import { WorldCoverSampler } from "../src/lib/landcover/worldcover";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const dates = listRawDates();
  if (!dates.length) throw new Error("No raw data. Run `npm run ingest` first.");
  const rawDays: RawDay[] = [];
  for (const d of dates) for (const s of VIIRS_SOURCES) {
    const r = readRawDay(s, d);
    if (r) rawDays.push(r);
  }

  const sitesData = loadSites();
  if (!sitesData.available) console.warn("WARNING: industrial layer missing — facility matching disabled. Run `npm run build:industrial`.");
  else console.log(`industrial layer: ${sitesData.meta.count} sites (built ${sitesData.meta.builtAt})`);

  const useLc = !process.argv.includes("--no-landcover");
  const sampler = useLc ? new WorldCoverSampler() : null;
  const rings = loadIndiaRings();

  const t0 = Date.now();
  const snap = await buildSnapshot({
    rawDays,
    sites: sitesData.index,
    sitesMeta: sitesData.meta,
    landCover: sampler,
    inIndia: (lat, lon) => inIndia(lat, lon, rings),
    hotspotDays: parseInt(arg("hotspot-days", "3"), 10),
    log: (m) => console.log(m),
  });
  sampler?.save();
  if (sampler) console.log("land-cover sampler:", sampler.stats);
  writeSnapshot(snap);

  console.log(`\nsnapshot ${snap.latestDate} built in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${snapshotPath()}`);
  for (const d of snap.hotspotDates) {
    const c = snap.counts[d];
    console.log(`${d}: raw ${c.raw} → classified ${c.classified} → needs attention ${c.needsAttention}`, c.byClass);
  }
  console.log(`persistent-source register: ${snap.sources.length} sources; triage items: ${snap.triage.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
