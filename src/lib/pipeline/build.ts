/**
 * Snapshot builder: raw detections + industrial layer + land cover → classified hotspots,
 * persistent-source register, triage queue. Deterministic given its inputs.
 */
import { classify, CLASS_IDS, CLASSIFIER_VERSION, type ClassId, type LandCover, type SiteMatch } from "@/lib/classify";
import { CLASSIFIER_CONFIG as C } from "@/lib/classify/config";
import { cellId, cellOf, median } from "@/lib/geo/geo";
import type { SiteIndex } from "@/lib/geo/site-index";
import { addDays } from "./dates";
import { RecurrenceIndex, type DayDetection } from "./recurrence";
import type { RawDay, RawRow, ViirsSource } from "./raw-store";
import type { ClassifiedHotspot, DayCounts, PersistentSource, Snapshot, TriageItem } from "./types";

export interface LandCoverProvider {
  sampleMany(points: Array<{ lat: number; lon: number }>): Promise<Array<LandCover | null>>;
}

export interface BuildInput {
  rawDays: RawDay[];
  sites: SiteIndex;
  sitesMeta: { count: number; builtAt: string | null; source: string; coverage?: { chunksUsed: number; chunksTotal: number; complete: boolean } };
  landCover: LandCoverProvider | null;
  inIndia: (lat: number, lon: number) => boolean;
  /** Number of most-recent observed dates whose individual hotspots are stored. */
  hotspotDays?: number;
  log?: (msg: string) => void;
}

interface Det {
  source: ViirsSource;
  row: RawRow;
  date: string;
}

const emptyByClass = (): Record<ClassId, number> =>
  Object.fromEntries(CLASS_IDS.map((c) => [c, 0])) as Record<ClassId, number>;

const hhmm = (t: string) => t.replace(":", "").padStart(4, "0");

export function hotspotId(d: { source: string; acqDate: string; acqTime: string; lat: number; lon: number }): string {
  return `${d.acqDate.replace(/-/g, "")}_${hhmm(d.acqTime)}_${d.source.replace("viirs_", "")}_${Math.round(d.lat * 1e4)}_${Math.round(d.lon * 1e4)}`;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export async function buildSnapshot(input: BuildInput): Promise<Snapshot> {
  const log = input.log ?? (() => {});
  const hotspotDays = input.hotspotDays ?? 3;

  // 1. Flatten, clip to India, dedupe.
  const seen = new Set<string>();
  const dets: Det[] = [];
  const rowsPerDate = new Map<string, number>();
  for (const day of input.rawDays) {
    rowsPerDate.set(day.date, (rowsPerDate.get(day.date) ?? 0) + day.rows.length);
    for (const row of day.rows) {
      if (!input.inIndia(row[0], row[1])) continue;
      const key = `${day.source}|${day.date}|${row[5]}|${row[0].toFixed(4)}|${row[1].toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dets.push({ source: day.source, row, date: day.date });
    }
  }
  // A date is "observed" only if data actually exists; a zero-row day means "not published", not "no fires".
  const observedDates = [...rowsPerDate.entries()].filter(([, n]) => n > 0).map(([d]) => d).sort();
  if (observedDates.length === 0) throw new Error("No raw detections found — run `npm run ingest` first.");
  const latestDate = observedDates[observedDates.length - 1];
  const hotspotDates = observedDates.slice(-hotspotDays);
  log(`${dets.length} India detections over ${observedDates.length} observed days; latest ${latestDate}`);

  const rec = new RecurrenceIndex(
    dets.map((d): DayDetection => ({ date: d.date, lat: d.row[0], lon: d.row[1], frp: d.row[2] })),
    observedDates
  );

  // 2. Land cover for the hotspots we will classify (+ register centroids later).
  const target = dets.filter((d) => hotspotDates.includes(d.date));
  const lcFor = new Map<string, LandCover | null>();
  if (input.landCover) {
    const uniq = new Map<string, { lat: number; lon: number }>();
    for (const d of target) uniq.set(`${d.row[0].toFixed(4)},${d.row[1].toFixed(4)}`, { lat: d.row[0], lon: d.row[1] });
    log(`sampling land cover for ${uniq.size} unique locations…`);
    const keys = [...uniq.keys()];
    const vals = await input.landCover.sampleMany(keys.map((k) => uniq.get(k)!));
    keys.forEach((k, i) => lcFor.set(k, vals[i]));
  }

  // 3. Classify.
  const hotspots: ClassifiedHotspot[] = [];
  const counts: Record<string, DayCounts> = {};
  for (const d of hotspotDates) counts[d] = { raw: 0, classified: 0, byClass: emptyByClass(), needsAttention: 0, watch: 0 };

  for (const d of target) {
    const [lat, lon, frp, brightness, brightT31, acqTime, dayNight, detConf] = d.row;
    const match: SiteMatch | null = input.sites.nearest(lat, lon);
    const history = rec.history(lat, lon, d.date, C.historyWindowDays);
    const landCover = lcFor.get(`${lat.toFixed(4)},${lon.toFixed(4)}`) ?? null;
    const res = classify(
      { lat, lon, frp, brightness, brightT31, dayNight, acqDate: d.date, acqTime, instrument: "VIIRS", detectionConfidence: detConf },
      { site: match, history, landCover }
    );
    const h: ClassifiedHotspot = {
      id: hotspotId({ source: d.source, acqDate: d.date, acqTime, lat, lon }),
      source: d.source,
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      acqDate: d.date,
      acqTime: hhmm(acqTime),
      frp: round1(frp),
      brightness: round1(brightness),
      brightT31: brightT31 == null ? null : round1(brightT31),
      dayNight,
      detectionConfidence: detConf,
      class: res.class,
      subtype: res.subtype,
      confidence: res.confidence,
      landCover,
      site: match ? { id: match.site.id, name: match.site.name, category: match.site.category, distanceM: Math.round(match.distanceM) } : null,
      history: {
        daysActive: history.daysActive,
        observedDays: history.observedDays,
        frpMedian: round1(history.frpMedian),
        frpSamples: history.frpSamples,
        firstSeen: history.firstSeen,
        lastSeen: history.lastSeen,
      },
    };
    hotspots.push(h);
    const c = counts[d.date];
    c.raw++;
    c.byClass[h.class]++;
    if (h.class !== "unclassified") c.classified++;
  }

  // 4. Triage queue: industrial anomalies, merged per location+day (several satellites see the same event).
  const triageMap = new Map<string, TriageItem>();
  const confW = { high: 3, medium: 2, low: 1 } as const;
  for (const h of hotspots) {
    if (h.class !== "industrial_anomaly") continue;
    const key = `${h.acqDate}|${cellId(h.lat, h.lon)}`;
    const prev = triageMap.get(key);
    const score = confW[h.confidence] * 10 + Math.log10(Math.max(1, h.frp)) * 5;
    const headline = h.site
      ? `${h.history.daysActive === 0 ? "New" : "Unusual"} heat at ${h.site.name ?? h.site.category.replace("_", " ")}`
      : "Unusual industrial heat";
    if (!prev) {
      triageMap.set(key, {
        key,
        id: h.id,
        class: h.class,
        confidence: h.confidence,
        lat: h.lat,
        lon: h.lon,
        acqDate: h.acqDate,
        acqTime: h.acqTime,
        frp: h.frp,
        detections: 1,
        siteName: h.site?.name ?? null,
        siteCategory: h.site?.category ?? null,
        distanceM: h.site?.distanceM ?? null,
        headline,
        score,
        priority: h.confidence === "low" ? "watch" : "review",
      });
    } else {
      prev.detections++;
      if (h.frp > prev.frp) Object.assign(prev, { id: h.id, lat: h.lat, lon: h.lon, frp: h.frp, acqTime: h.acqTime, score: Math.max(prev.score, score) });
      // merged item takes the strongest evidence among its detections
      if (confW[h.confidence] > confW[prev.confidence]) {
        prev.confidence = h.confidence;
        prev.priority = h.confidence === "low" ? "watch" : "review";
      }
    }
  }
  const triage = [...triageMap.values()].sort(
    (a, b) => b.acqDate.localeCompare(a.acqDate) || Number(b.priority === "review") - Number(a.priority === "review") || b.score - a.score
  );
  for (const t of triage) counts[t.acqDate][t.priority === "review" ? "needsAttention" : "watch"]++;

  // 5. Persistent-thermal-source register: cluster active cells over the window.
  const sources = await buildRegister(input, dets, rec, observedDates, latestDate);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    classifierVersion: CLASSIFIER_VERSION,
    region: "india",
    latestDate,
    observedDates,
    hotspotDates,
    counts,
    layers: {
      industrialSites: input.sitesMeta,
      landCover: input.landCover ? "ESA WorldCover 2021 (10 m)" : "none",
      historyWindowDays: C.historyWindowDays,
    },
    hotspots,
    sources,
    triage,
  };
}

async function buildRegister(
  input: BuildInput,
  dets: Det[],
  rec: RecurrenceIndex,
  observedDates: string[],
  latestDate: string
): Promise<PersistentSource[]> {
  const from = addDays(latestDate, -C.historyWindowDays + 1);
  const win = dets.filter((d) => d.date >= from && d.date <= latestDate);

  // cell → date → detections
  const cells = new Map<string, Det[]>();
  for (const d of win) {
    const id = cellId(d.row[0], d.row[1]);
    (cells.get(id) ?? cells.set(id, []).get(id)!).push(d);
  }
  // Only cells that are THEMSELVES persistent (neighbourhood active on >= persistentMinDays distinct days)
  // seed clusters. Clustering every occupied cell would chain adjacent stubble-burning fields into
  // giant fake "persistent sources" in burning season.
  const datesOf = (id: string) => new Set((cells.get(id) ?? []).map((d) => d.date));
  const persistentCells = new Set<string>();
  for (const id of cells.keys()) {
    const [i, j] = id.split("_").map(Number);
    const days = new Set<string>();
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) for (const d of datesOf(`${i + di}_${j + dj}`)) days.add(d);
    if (days.size >= C.persistentMinDays) persistentCells.add(id);
  }
  // Union-find over 8-neighbour adjacency of persistent cells.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  for (const id of persistentCells) parent.set(id, id);
  for (const id of persistentCells) {
    const [i, j] = id.split("_").map(Number);
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        const n = `${i + di}_${j + dj}`;
        if (persistentCells.has(n)) parent.set(find(n), find(id));
      }
  }
  const clusters = new Map<string, Det[]>();
  for (const id of persistentCells) {
    const root = find(id);
    (clusters.get(root) ?? clusters.set(root, []).get(root)!).push(...cells.get(id)!);
  }

  const observedInWindow = observedDates.filter((d) => d >= from && d <= latestDate).length;
  const candidates = [...clusters.values()].filter((list) => new Set(list.map((d) => d.date)).size >= C.persistentMinDays);

  // Representative point and land cover per cluster.
  const reps = candidates.map((list) => ({
    lat: list.reduce((s, d) => s + d.row[0], 0) / list.length,
    lon: list.reduce((s, d) => s + d.row[1], 0) / list.length,
    list,
  }));
  const lcs = input.landCover ? await input.landCover.sampleMany(reps.map((r) => ({ lat: r.lat, lon: r.lon }))) : reps.map(() => null);

  const out: PersistentSource[] = reps.map((r, idx) => {
    const days = [...new Set(r.list.map((d) => d.date))].sort();
    const perDayMax = days.map((day) => Math.max(...r.list.filter((d) => d.date === day).map((d) => d.row[2])));
    const sorted = [...perDayMax].sort((a, b) => a - b);
    const last = [...r.list].sort((a, b) => b.date.localeCompare(a.date) || b.row[2] - a.row[2])[0];
    const match = input.sites.nearest(r.lat, r.lon);
    const res = classify(
      { lat: last.row[0], lon: last.row[1], frp: last.row[2], brightness: last.row[3], brightT31: last.row[4], dayNight: last.row[6], acqDate: last.date, acqTime: last.row[5], instrument: "VIIRS", detectionConfidence: last.row[7] },
      { site: match, history: rec.history(last.row[0], last.row[1], last.date, C.historyWindowDays), landCover: lcs[idx] }
    );
    return {
      id: cellId(r.lat, r.lon),
      lat: Math.round(r.lat * 1e5) / 1e5,
      lon: Math.round(r.lon * 1e5) / 1e5,
      class: res.class,
      subtype: res.subtype,
      confidence: res.confidence,
      siteName: match?.site.name ?? null,
      siteCategory: match?.site.category ?? null,
      daysActive: days.length,
      windowDays: observedInWindow,
      firstSeen: days[0],
      lastSeen: days[days.length - 1],
      frpMedian: round1(median(perDayMax)),
      frpP90: round1(quantile(sorted, 0.9)),
      lastFrp: round1(last.row[2]),
      detections: r.list.length,
      landCover: lcs[idx],
    };
  });
  return out.sort((a, b) => b.daysActive - a.daysActive || b.frpMedian - a.frpMedian);
}
