/**
 * Evaluate the classifier against externally VERIFIED sites (data/validation/sites.json).
 * Usage: npm run evaluate
 *
 * For each verified site we take the real detections within MATCH_M on the site's `date` (or, if no
 * date is given, the latest observed date with a detection there), classify the strongest one with
 * the SAME pipeline code as production, and compare to the verified class.
 * Sites with no detection are reported separately — they are not errors of the classifier.
 * Output: data/validation/results.json (served by /api/validation and shown in the app).
 */
import fs from "node:fs";
import path from "node:path";
import { classify, CLASS_IDS, CLASSIFIER_VERSION, type ClassId } from "../src/lib/classify";
import { CLASSIFIER_CONFIG as C } from "../src/lib/classify/config";
import { haversineMeters } from "../src/lib/geo/geo";
import { RecurrenceIndex } from "../src/lib/pipeline/recurrence";
import { listRawDates, readRawDay, VIIRS_SOURCES } from "../src/lib/pipeline/raw-store";
import { loadSites } from "../src/lib/pipeline/sites";
import { WorldCoverSampler } from "../src/lib/landcover/worldcover";

const MATCH_M = 600;
const DIR = path.join(process.cwd(), "data", "validation");

interface VerifiedSite {
  name: string;
  lat: number;
  lon: number;
  trueClass: ClassId;
  date?: string;
  evidenceUrl?: string;
  /** "imagery" (e.g. Sentinel-2 SWIR checked by a person) or "documentary" (facility records / reports only). */
  evidenceType?: "imagery" | "documentary";
  /** Match radius in metres around lat/lon (default 600). Large plants need more than a point. */
  radiusM?: number;
  verifiedBy?: string;
  verifiedAt?: string;
  note?: string;
}

async function main() {
  const file = path.join(DIR, "sites.json");
  const input = JSON.parse(fs.readFileSync(file, "utf8")) as { sites: VerifiedSite[] };
  const sites = (input.sites ?? []).filter((s) => s.name && Number.isFinite(s.lat) && s.trueClass);
  const out = path.join(DIR, "results.json");

  if (sites.length === 0) {
    fs.writeFileSync(out, JSON.stringify({ available: false, generatedAt: new Date().toISOString(), message: "No verified sites in data/validation/sites.json yet." }, null, 2));
    console.log("No verified sites yet — wrote available:false. See data/validation/README.md");
    return;
  }

  const dates = listRawDates();
  const dets: Array<{ date: string; lat: number; lon: number; frp: number; brightness: number; t31: number | null; time: string; dn: "D" | "N"; dc: string | null }> = [];
  const rowsPerDate = new Map<string, number>();
  for (const d of dates)
    for (const s of VIIRS_SOURCES) {
      const r = readRawDay(s, d);
      if (!r) continue;
      rowsPerDate.set(d, (rowsPerDate.get(d) ?? 0) + r.rows.length);
      for (const row of r.rows) dets.push({ date: d, lat: row[0], lon: row[1], frp: row[2], brightness: row[3], t31: row[4], time: row[5], dn: row[6], dc: row[7] });
    }
  const observed = [...rowsPerDate.entries()].filter(([, n]) => n > 0).map(([d]) => d);
  const rec = new RecurrenceIndex(dets, observed);
  const siteIdx = loadSites();
  const lc = new WorldCoverSampler();

  const labels = [...CLASS_IDS];
  const matrix = labels.map(() => labels.map(() => 0));
  const rows: Array<{ name: string; evidenceType?: string; radiusM?: number; trueClass: ClassId; predictedClass: ClassId | null; correct: boolean | null; status: "evaluated" | "no_detection"; confidence?: string; date?: string; note?: string }> = [];

  for (const s of sites) {
    const near = dets.filter((d) => haversineMeters(s.lat, s.lon, d.lat, d.lon) <= (s.radiusM ?? MATCH_M) && (!s.date || d.date === s.date));
    if (near.length === 0) {
      rows.push({ name: s.name, trueClass: s.trueClass, predictedClass: null, correct: null, status: "no_detection", date: s.date, note: `No VIIRS detection within ${s.radiusM ?? MATCH_M} m${s.date ? " on that date" : " in the ingested window"}.` });
      continue;
    }
    const pick = near.sort((a, b) => b.date.localeCompare(a.date) || b.frp - a.frp)[0];
    const landCover = (await lc.sampleMany([{ lat: pick.lat, lon: pick.lon }]))[0];
    const res = classify(
      { lat: pick.lat, lon: pick.lon, frp: pick.frp, brightness: pick.brightness, brightT31: pick.t31, dayNight: pick.dn, acqDate: pick.date, acqTime: pick.time, instrument: "VIIRS", detectionConfidence: pick.dc },
      { site: siteIdx.index.nearest(pick.lat, pick.lon), history: rec.history(pick.lat, pick.lon, pick.date, C.historyWindowDays), landCover }
    );
    matrix[labels.indexOf(s.trueClass)][labels.indexOf(res.class)]++;
    rows.push({ name: s.name, evidenceType: s.evidenceType, radiusM: s.radiusM ?? MATCH_M, trueClass: s.trueClass, predictedClass: res.class, correct: res.class === s.trueClass, status: "evaluated", confidence: res.confidence, date: pick.date, note: s.note });
  }
  lc.save();

  const evaluated = rows.filter((r) => r.status === "evaluated");
  const perClass: Record<string, { precision: number | null; recall: number | null; support: number }> = {};
  labels.forEach((c, i) => {
    const tp = matrix[i][i];
    const fn = matrix[i].reduce((a, b) => a + b, 0) - tp;
    const fp = matrix.reduce((a, row) => a + row[i], 0) - tp;
    perClass[c] = {
      precision: tp + fp ? Math.round((tp / (tp + fp)) * 1000) / 1000 : null,
      recall: tp + fn ? Math.round((tp / (tp + fn)) * 1000) / 1000 : null,
      support: tp + fn,
    };
  });
  const correct = evaluated.filter((r) => r.correct).length;
  const result = {
    available: true,
    generatedAt: new Date().toISOString(),
    classifierVersion: CLASSIFIER_VERSION,
    n: evaluated.length,
    skippedNoDetection: rows.length - evaluated.length,
    accuracy: evaluated.length ? Math.round((correct / evaluated.length) * 1000) / 1000 : null,
    // Coarser question: did we at least separate industrial heat from everything else?
    industrialVsOther: (() => {
      const isInd = (c: ClassId | null) => c === "industrial_anomaly" || c === "industrial_persistent";
      const ok = evaluated.filter((r) => isInd(r.trueClass) === isInd(r.predictedClass)).length;
      return { n: evaluated.length, accuracy: evaluated.length ? Math.round((ok / evaluated.length) * 1000) / 1000 : null };
    })(),
    evidenceMix: rows.reduce<Record<string, number>>((a, r) => ((a[r.evidenceType ?? "unspecified"] = (a[r.evidenceType ?? "unspecified"] ?? 0) + 1), a), {}),
    perClass,
    confusion: { labels, matrix },
    sites: rows,
    caveats: [
      `Small verified set (n=${evaluated.length}); per-class figures are indicative, not statistically robust.`,
      "Thresholds were set a priori (src/lib/classify/config.ts); tuning on this set would inflate these numbers.",
      "Sites with no VIIRS detection on the chosen date are excluded, not counted as correct.",
      "Verified classes come from external evidence recorded per site (evidenceUrl/verifiedBy). Rows marked \"documentary\" rest on facility records only, not on imagery of the detection itself.",
      "A documented continuously-operating plant does not prove a given day's detection was routine; use the industrial-vs-other figure as the fair comparison for those rows.",
    ],
  };
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`evaluated ${evaluated.length} sites (${rows.length - evaluated.length} without detection): accuracy ${result.accuracy}`);
  console.table(rows.map((r) => ({ name: r.name, true: r.trueClass, predicted: r.predictedClass, ok: r.correct })));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
