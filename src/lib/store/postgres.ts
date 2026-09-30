/**
 * PostGIS-backed read/write path (schema `agni`, created by db/sql/*.sql, filled by `npm run db:load`).
 * Every function returns the same shapes the file-snapshot code returns, so routes can use either.
 * All SQL is parameterised; dates are formatted in SQL (to_char) to avoid timezone drift.
 */
import { db } from "@/lib/db";
import type { Bbox } from "@/lib/geo/geo";
import type { ClassId, SiteCategory } from "@/lib/classify/types";
import { CLASS_IDS } from "@/lib/classify/types";
import type { ViirsSource } from "@/lib/pipeline/raw-store";
import type { ClassifiedHotspot, HotspotListItem, PersistentSource, TriageItem } from "@/lib/pipeline/types";

/* ------------------------------------------------------------------ */
/* availability                                                         */
/* ------------------------------------------------------------------ */

let readyCache: { at: number; ok: boolean } | null = null;
const READY_TTL_MS = 30_000;

/** True when a database is configured, reachable and has been loaded. Cached briefly. */
export async function dbReady(): Promise<boolean> {
  if (!process.env.DATABASE_URL || process.env.AGNI_STORE === "files") return false;
  if (readyCache && Date.now() - readyCache.at < READY_TTL_MS) return readyCache.ok;
  let ok = false;
  try {
    const r = await db.$queryRawUnsafe<Array<{ n: bigint }>>("select count(*) as n from agni.snapshot_meta where id = 1");
    ok = Number(r[0].n) === 1;
  } catch (e) {
    console.warn("[store] database unavailable, using files:", String(e instanceof Error ? e.message : e).replace(/postgres(ql)?:\/\/\S+/g, "<url>").slice(0, 160));
  }
  readyCache = { at: Date.now(), ok };
  return ok;
}

/** Run a DB query; on any error mark the DB as not-ready for a while and return null so callers fall back to files. */
export async function tryDb<T>(fn: () => Promise<T>): Promise<T | null> {
  if (!(await dbReady())) return null;
  try {
    return await fn();
  } catch (e) {
    console.warn("[store] query failed, falling back to files:", String(e instanceof Error ? e.message : e).slice(0, 200));
    readyCache = { at: Date.now(), ok: false };
    return null;
  }
}

const num = (v: unknown): number => (typeof v === "bigint" ? Number(v) : Number(v ?? 0));

/* ------------------------------------------------------------------ */
/* snapshot meta                                                        */
/* ------------------------------------------------------------------ */

export interface MetaRow {
  generatedAt: string;
  latestDate: string;
  classifierVersion: string;
  observedDates: string[];
  layers: {
    industrialSites: { count: number; builtAt: string | null; source: string; coverage?: { chunksUsed: number; chunksTotal: number; complete: boolean } };
    landCover: string;
    historyWindowDays: number;
  };
  ageHours: number;
}

export async function getMeta(): Promise<MetaRow> {
  const r = await db.$queryRawUnsafe<Array<{ generated_at: Date; latest_date: string; classifier_version: string; observed_dates: string[]; layers: MetaRow["layers"] }>>(
    "select generated_at, to_char(latest_date,'YYYY-MM-DD') as latest_date, classifier_version, observed_dates, layers from agni.snapshot_meta where id = 1"
  );
  const m = r[0];
  return {
    generatedAt: new Date(m.generated_at).toISOString(),
    latestDate: m.latest_date,
    classifierVersion: m.classifier_version,
    observedDates: m.observed_dates,
    layers: m.layers,
    ageHours: Math.round(((Date.now() - new Date(m.generated_at).getTime()) / 3_600_000) * 10) / 10,
  };
}

export async function getAvailableDates(): Promise<string[]> {
  const r = await db.$queryRawUnsafe<Array<{ d: string }>>(
    "select to_char(d,'YYYY-MM-DD') as d from (select distinct acq_date as d from agni.hotspot order by 1 desc limit 7) x order by 1"
  );
  return r.map((x) => x.d);
}

/** Same semantics as the file-based selectDates: last N available days, optionally ending at `date`. */
export function pickDates(available: string[], end: string | null, daysParam: string | null): string[] {
  const upto = end && available.includes(end) ? available.filter((d) => d <= end) : available;
  const days = Math.max(1, Math.min(available.length, parseInt(daysParam ?? "1", 10) || 1));
  return upto.slice(-days);
}

/* ------------------------------------------------------------------ */
/* hotspots                                                             */
/* ------------------------------------------------------------------ */

export async function queryHotspots(opts: {
  dates: string[];
  classes: Set<ClassId> | null;
  bbox: Bbox | null;
  minFrp: number;
  limit: number;
}) {
  const b = opts.bbox;
  const where = `acq_date = ANY($1::date[]) AND frp >= $2 AND ($3::float8 IS NULL OR geom && ST_MakeEnvelope($3, $4, $5, $6, 4326))`;
  const bp = [b?.west ?? null, b?.south ?? null, b?.east ?? null, b?.north ?? null];

  const totalsRows = await db.$queryRawUnsafe<Array<{ class: ClassId; n: bigint }>>(
    `select class, count(*) as n from agni.hotspot where ${where} group by class`,
    opts.dates, opts.minFrp, ...bp
  );
  const byClass = Object.fromEntries(CLASS_IDS.map((c) => [c, 0])) as Record<ClassId, number>;
  let raw = 0;
  let classified = 0;
  for (const r of totalsRows) {
    const n = num(r.n);
    byClass[r.class] = n;
    raw += n;
    if (r.class !== "unclassified") classified += n;
  }

  const classList = opts.classes ? [...opts.classes] : null;
  const rows = await db.$queryRawUnsafe<
    Array<{ id: string; lat: number; lon: number; acq_date: string; acq_time: string; frp: number; class: ClassId; subtype: string | null; confidence: HotspotListItem["confidence"]; source: ViirsSource; site_name: string | null; site_category: SiteCategory | null }>
  >(
    `select id, lat, lon, to_char(acq_date,'YYYY-MM-DD') as acq_date, acq_time, frp, class, subtype, confidence, source, site_name, site_category
     from agni.hotspot where ${where} AND ($7::text[] IS NULL OR class = ANY($7::text[]))
     order by frp desc limit $8`,
    opts.dates, opts.minFrp, ...bp, classList, opts.limit + 1
  );
  const truncated = rows.length > opts.limit;
  const features: HotspotListItem[] = rows.slice(0, opts.limit).map((r) => ({
    id: r.id, lat: r.lat, lon: r.lon, acqDate: r.acq_date, acqTime: r.acq_time, frp: r.frp, class: r.class, subtype: r.subtype,
    confidence: r.confidence, source: r.source, siteName: r.site_name, siteCategory: r.site_category,
  }));
  return { raw, classified, byClass, features, truncated };
}

export async function getHotspotRow(id: string): Promise<ClassifiedHotspot | null> {
  const r = await db.$queryRawUnsafe<Array<Record<string, any>>>(
    `select id, source, to_char(acq_date,'YYYY-MM-DD') as acq_date, acq_time, lat, lon, frp, brightness, bright_t31, day_night, detection_confidence, class, subtype, confidence, land_cover,
       site_id, site_name, site_category, site_distance_m, days_active, observed_days, frp_median, frp_samples,
       to_char(first_seen,'YYYY-MM-DD') as first_seen, to_char(last_seen,'YYYY-MM-DD') as last_seen
     from agni.hotspot where id = $1`,
    id
  );
  const h = r[0];
  if (!h) return null;
  return {
    id: h.id, source: h.source, lat: h.lat, lon: h.lon, acqDate: h.acq_date, acqTime: h.acq_time, frp: h.frp, brightness: h.brightness ?? 0,
    brightT31: h.bright_t31 ?? null, dayNight: h.day_night, detectionConfidence: h.detection_confidence ?? null, class: h.class, subtype: h.subtype,
    confidence: h.confidence, landCover: h.land_cover,
    site: h.site_id ? { id: h.site_id, name: h.site_name, category: h.site_category, distanceM: h.site_distance_m ?? 0 } : null,
    history: { daysActive: h.days_active ?? 0, observedDays: h.observed_days ?? 0, frpMedian: h.frp_median ?? 0, frpSamples: h.frp_samples ?? 0, firstSeen: h.first_seen, lastSeen: h.last_seen },
  };
}

export interface NearbyFacility {
  name: string | null;
  category: SiteCategory;
  distanceM: number;
  kind: "area" | "point";
}

/** Nearest mapped facilities to a point, by true geography distance (PostGIS). GiST-prefiltered by bbox. */
export async function nearbyFacilities(lat: number, lon: number, radiusM = 2000, limit = 5): Promise<NearbyFacility[]> {
  const pad = radiusM / 111_000 + 0.005;
  const r = await db.$queryRawUnsafe<Array<{ name: string | null; category: SiteCategory; dist: number; geomtype: string }>>(
    `with p as (select ST_SetSRID(ST_MakePoint($2, $1), 4326) as g)
     select s.name, s.category, ST_Distance(s.geom::geography, p.g::geography) as dist, GeometryType(s.geom) as geomtype
     from agni.industrial_site s, p
     where s.geom && ST_Expand(p.g, $3) and ST_DWithin(s.geom::geography, p.g::geography, $4)
     order by dist asc limit $5`,
    lat, lon, pad, radiusM, limit
  );
  return r.map((x) => ({ name: x.name, category: x.category, distanceM: Math.round(x.dist), kind: x.geomtype.startsWith("POLY") ? "area" : "point" }));
}

/* ------------------------------------------------------------------ */
/* triage                                                               */
/* ------------------------------------------------------------------ */

export type TriageStatus = "open" | "ack" | "dismissed";
export type TriageItemWithStatus = TriageItem & { status: TriageStatus };

export async function queryTriage(dates: string[]): Promise<TriageItemWithStatus[]> {
  const r = await db.$queryRawUnsafe<Array<Record<string, any>>>(
    `select triage_key, hotspot_id, class, confidence, priority, lat, lon, to_char(acq_date,'YYYY-MM-DD') as acq_date, acq_time, frp, detections,
       site_name, site_category, distance_m, headline, score, status
     from agni.triage_item where acq_date = ANY($1::date[])
     order by acq_date desc, (priority = 'review') desc, score desc`,
    dates
  );
  return r.map((t) => ({
    key: t.triage_key, id: t.hotspot_id, class: t.class, confidence: t.confidence, lat: t.lat, lon: t.lon, acqDate: t.acq_date, acqTime: t.acq_time,
    frp: t.frp, detections: t.detections, siteName: t.site_name, siteCategory: t.site_category, distanceM: t.distance_m, headline: t.headline,
    score: t.score, priority: t.priority, status: t.status,
  }));
}

export async function setTriageStatus(key: string, status: TriageStatus): Promise<boolean> {
  const r = await db.$queryRawUnsafe<Array<{ triage_key: string }>>(
    `update agni.triage_item set status = $2, status_updated_at = now() where triage_key = $1 returning triage_key`,
    key, status
  );
  return r.length === 1;
}

/* ------------------------------------------------------------------ */
/* register + layers                                                    */
/* ------------------------------------------------------------------ */

export async function querySources(classes: Set<ClassId> | null): Promise<{ latestDate: string; sources: PersistentSource[] }> {
  const r = await db.$queryRawUnsafe<Array<Record<string, any>>>(
    `select id, lat, lon, class, subtype, confidence, site_name, site_category, days_active, window_days,
       to_char(first_seen,'YYYY-MM-DD') as first_seen, to_char(last_seen,'YYYY-MM-DD') as last_seen, frp_median, frp_p90, last_frp, detections, land_cover,
       to_char(latest_date,'YYYY-MM-DD') as latest_date
     from agni.persistent_source where ($1::text[] IS NULL OR class = ANY($1::text[]))
     order by days_active desc, frp_median desc`,
    classes ? [...classes] : null
  );
  return {
    latestDate: r[0]?.latest_date ?? "",
    sources: r.map((s) => ({
      id: s.id, lat: s.lat, lon: s.lon, class: s.class, subtype: s.subtype, confidence: s.confidence, siteName: s.site_name, siteCategory: s.site_category,
      daysActive: s.days_active, windowDays: s.window_days, firstSeen: s.first_seen, lastSeen: s.last_seen, frpMedian: s.frp_median ?? 0, frpP90: s.frp_p90 ?? 0,
      lastFrp: s.last_frp ?? 0, detections: s.detections ?? 0, landCover: s.land_cover,
    })),
  };
}

export async function queryIndustrialLayer(bbox: Bbox, cats: string[] | undefined, limit: number) {
  const where = `geom && ST_MakeEnvelope($1, $2, $3, $4, 4326) AND ($5::text[] IS NULL OR category = ANY($5::text[]))`;
  const p = [bbox.west, bbox.south, bbox.east, bbox.north, cats?.length ? cats : null];
  const [rows, cnt, total] = await Promise.all([
    db.$queryRawUnsafe<Array<{ id: string; name: string | null; category: string; lat: number; lon: number; gj: string }>>(
      `select id, name, category, lat, lon, ST_AsGeoJSON(geom, 5) as gj from agni.industrial_site where ${where} limit $6`, ...p, limit
    ),
    db.$queryRawUnsafe<Array<{ n: bigint }>>(`select count(*) as n from agni.industrial_site where ${where}`, ...p),
    db.$queryRawUnsafe<Array<{ n: bigint }>>("select count(*) as n from agni.industrial_site"),
  ]);
  return {
    features: rows.map((r) => ({ type: "Feature" as const, geometry: JSON.parse(r.gj), properties: { id: r.id, name: r.name, category: r.category, lat: r.lat, lon: r.lon } })),
    matched: num(cnt[0].n),
    total: num(total[0].n),
  };
}

export async function getStoreCounts() {
  const r = await db.$queryRawUnsafe<Array<{ hotspots: bigint; sources: bigint; triage: bigint; open: bigint; ack: bigint; dismissed: bigint }>>(
    `select (select count(*) from agni.hotspot) as hotspots, (select count(*) from agni.persistent_source) as sources, (select count(*) from agni.triage_item) as triage,
       (select count(*) from agni.triage_item where status = 'open') as open, (select count(*) from agni.triage_item where status = 'ack') as ack,
       (select count(*) from agni.triage_item where status = 'dismissed') as dismissed`
  );
  const x = r[0];
  return { hotspots: num(x.hotspots), persistentSources: num(x.sources), triageItems: num(x.triage), triageOpen: num(x.open), triageAck: num(x.ack), triageDismissed: num(x.dismissed) };
}
