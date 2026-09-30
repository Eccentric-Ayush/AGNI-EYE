/**
 * Raw per-day detection files (server/script only): data/raw/<source>/<date>.json
 * Compact row layout keeps 30+ days of India VIIRS small and reproducible. The raw cache is
 * git-ignored; it can always be rebuilt with `npm run ingest`.
 */
import fs from "node:fs";
import path from "node:path";

export const VIIRS_SOURCES = ["viirs_snpp", "viirs_noaa20", "viirs_noaa21"] as const;
export type ViirsSource = (typeof VIIRS_SOURCES)[number];

/** [lat, lon, frp, brightness, brightT31|null, acqTime "HHMM", dayNight, detectionConfidence ("low"|"nominal"|"high")|null, satellite] */
export type RawRow = [number, number, number, number, number | null, string, "D" | "N", string | null, string];

export interface RawDay {
  date: string;
  source: ViirsSource;
  fetchedAt: string;
  tilesFetched: number;
  tilesFailed: number;
  complete: boolean;
  rows: RawRow[];
}

const root = () => path.join(process.cwd(), "data", "raw");
const fileFor = (source: string, date: string) => path.join(root(), source, `${date}.json`);

export function readRawDay(source: ViirsSource, date: string): RawDay | null {
  try {
    return JSON.parse(fs.readFileSync(fileFor(source, date), "utf8")) as RawDay;
  } catch {
    return null;
  }
}

export function writeRawDay(day: RawDay): void {
  const f = fileFor(day.source, day.date);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(day));
}

export function listRawDates(): string[] {
  const dates = new Set<string>();
  for (const s of VIIRS_SOURCES) {
    try {
      for (const f of fs.readdirSync(path.join(root(), s))) if (f.endsWith(".json")) dates.add(f.slice(0, 10));
    } catch {
      /* no data for this source yet */
    }
  }
  return [...dates].sort();
}
