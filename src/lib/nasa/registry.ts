/**
 * Shared helpers: source registry, dedupe, stats aggregation.
 */

import { GIBS_LAYERS, type FireFeature, type GibsSource } from "./gibs";

export const ALL_SOURCES: GibsSource[] = [
  "viirs_snpp",
  "viirs_noaa20",
  "viirs_noaa21",
  "modis_terra",
  "modis_aqua",
  "modis_combined",
];

export const SOURCE_LABELS: Record<GibsSource, string> = {
  viirs_snpp: "VIIRS S-NPP",
  viirs_noaa20: "VIIRS NOAA-20",
  viirs_noaa21: "VIIRS NOAA-21",
  modis_terra: "MODIS Terra",
  modis_aqua: "MODIS Aqua",
  modis_combined: "MODIS Combined",
};

export function parseSources(param: string | null): GibsSource[] {
  if (!param || param === "all") return ALL_SOURCES;
  const wanted = param
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is GibsSource => (ALL_SOURCES as string[]).includes(s));
  return wanted.length ? wanted : ALL_SOURCES;
}

/** Dedupe detections: same satellite + acquisition time + rounded position. */
export function dedupeFeatures(features: FireFeature[]): FireFeature[] {
  const seen = new Set<string>();
  const out: FireFeature[] = [];
  for (const f of features) {
    const p = f.properties;
    const key = `${p.satellite}|${p.acqDate}|${p.acqTime}|${p.latitude.toFixed(3)}|${p.longitude.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export interface FiresStats {
  total: number;
  bySource: Record<string, number>;
  byDayNight: { D: number; N: number };
  maxFrp: number;
  avgFrp: number;
  maxBrightness: number;
  avgBrightness: number;
  highFrpCount: number; // FRP >= 100 MW
  byHour: Array<{ hour: string; count: number }>;
  frpBuckets: Array<{ bucket: string; count: number }>;
  byDate: Array<{ date: string; count: number }>;
}

export function aggregateStats(features: FireFeature[]): FiresStats {
  const bySource: Record<string, number> = {};
  for (const s of ALL_SOURCES) bySource[s] = 0;
  let d = 0;
  let n = 0;
  let maxFrp = 0;
  let frpSum = 0;
  let maxBrightness = 0;
  let brightSum = 0;
  let highFrp = 0;
  const hours = new Map<number, number>();
  const dates = new Map<string, number>();
  const buckets = [0, 0, 0, 0, 0]; // 0-5, 5-20, 20-50, 50-100, 100+
  const bucketLabels = ["0–5 MW", "5–20 MW", "20–50 MW", "50–100 MW", "100+ MW"];

  for (const f of features) {
    const p = f.properties;
    bySource[p.source] = (bySource[p.source] ?? 0) + 1;
    if (p.dayNight === "N") n++;
    else d++;
    maxFrp = Math.max(maxFrp, p.frp);
    frpSum += p.frp;
    maxBrightness = Math.max(maxBrightness, p.brightness);
    brightSum += p.brightness;
    if (p.frp >= 100) highFrp++;
    const hh = parseInt(p.acqTime.slice(0, 2), 10);
    if (Number.isFinite(hh) && hh >= 0 && hh <= 23) hours.set(hh, (hours.get(hh) ?? 0) + 1);
    dates.set(p.acqDate, (dates.get(p.acqDate) ?? 0) + 1);
    if (p.frp < 5) buckets[0]++;
    else if (p.frp < 20) buckets[1]++;
    else if (p.frp < 50) buckets[2]++;
    else if (p.frp < 100) buckets[3]++;
    else buckets[4]++;
  }

  const total = features.length;
  return {
    total,
    bySource,
    byDayNight: { D: d, N: n },
    maxFrp: round1(maxFrp),
    avgFrp: total ? round1(frpSum / total) : 0,
    maxBrightness: round1(maxBrightness),
    avgBrightness: total ? round1(brightSum / total) : 0,
    highFrpCount: highFrp,
    byHour: Array.from({ length: 24 }, (_, h) => ({
      hour: `${String(h).padStart(2, "0")}:00`,
      count: hours.get(h) ?? 0,
    })),
    frpBuckets: buckets.map((count, i) => ({ bucket: bucketLabels[i], count })),
    byDate: Array.from(dates.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count })),
  };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export function shiftDate(s: string, deltaDays: number): string {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export { GIBS_LAYERS };
export type { GibsSource, FireFeature };
