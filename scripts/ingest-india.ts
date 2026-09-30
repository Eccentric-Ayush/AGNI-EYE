/**
 * Backfill/refresh India VIIRS (375 m) active-fire detections from NASA GIBS vector tiles into
 * data/raw. Usage: npm run ingest -- [--days 30] [--end YYYY-MM-DD]
 * Idempotent: complete past days are skipped; the last 2 days are always re-fetched (rolling data).
 * Add --force to re-fetch every day (e.g. after a decoder fix).
 */
import { fetchSourceFires } from "../src/lib/nasa/gibs";
import { INDIA_BBOX } from "../src/lib/geo/geo";
import { addDays, dateRange, todayUtc } from "../src/lib/pipeline/dates";
import { readRawDay, VIIRS_SOURCES, writeRawDay, type RawRow } from "../src/lib/pipeline/raw-store";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const end = arg("end", todayUtc());
  const days = Math.max(1, parseInt(arg("days", "30"), 10));
  const dates = dateRange(addDays(end, -(days - 1)), end);
  const refetchFrom = addDays(end, -1);
  const force = process.argv.includes("--force");
  let fetched = 0;
  let skipped = 0;

  for (const date of dates) {
    for (const source of VIIRS_SOURCES) {
      const existing = readRawDay(source, date);
      if (!force && existing?.complete && date < refetchFrom) {
        skipped++;
        continue;
      }
      const t0 = Date.now();
      const r = await fetchSourceFires(source, INDIA_BBOX, date, { maxTiles: 300, timeoutMs: 20000 });
      const rows: RawRow[] = r.features
        // GIBS returns data for the UTC day; keep only that day's rows
        .filter((f) => f.properties.acqDate === date)
        .map((f) => {
          const p = f.properties;
          return [p.latitude, p.longitude, p.frp, p.brightness, p.brightT31, p.acqTime.replace(":", ""), p.dayNight, p.confidenceLabel ?? null, p.satellite];
        });
      // A day is "complete" if no tile failed. A day with zero rows and zero failures is a true empty day.
      const complete = r.tilesFailed === 0;
      writeRawDay({
        date,
        source,
        fetchedAt: new Date().toISOString(),
        tilesFetched: r.tilesFetched,
        tilesFailed: r.tilesFailed,
        complete,
        rows,
      });
      fetched++;
      console.log(
        `${date} ${source.padEnd(13)} z${r.zoom} tiles ok=${String(r.tilesFetched).padStart(3)} failed=${String(r.tilesFailed).padStart(3)} rows=${String(rows.length).padStart(5)} ${Date.now() - t0}ms${complete ? "" : "  (INCOMPLETE — will retry)"}`
      );
    }
  }
  console.log(`done: fetched ${fetched}, skipped ${skipped} already-complete day-files`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
