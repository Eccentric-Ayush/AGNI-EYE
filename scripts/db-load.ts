/**
 * Load the classified snapshot + industrial layer into the PostGIS store (schema `agni`).
 * Usage: npm run db:load [-- --sites]      (--sites forces a reload of the industrial layer)
 *
 * - hotspots: UPSERT by id, so history accumulates beyond the snapshot window
 * - persistent sources: replaced (a current-state register)
 * - triage items: UPSERT by (day|cell) key; analyst status is NEVER overwritten
 * - industrial sites: reloaded when the layer file changed (or with --sites)
 */
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { readSnapshot } from "../src/lib/pipeline/snapshot-store";
import type { IndustrialSite } from "../src/lib/classify/types";

const BATCH = 1500;
const db = new PrismaClient();

function chunks<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

const pointGeoJson = (lon: number, lat: number) => JSON.stringify({ type: "Point", coordinates: [lon, lat] });

async function loadSites(force: boolean): Promise<void> {
  const file = path.join(process.cwd(), "data", "industrial-india.json.gz");
  if (!fs.existsSync(file)) {
    console.log("industrial layer file missing — skipping sites");
    return;
  }
  const layer = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8")) as { builtAt: string; sites: IndustrialSite[] };
  const cur = await db.$queryRawUnsafe<Array<{ layers: { industrialSites?: { builtAt?: string } } }>>("select layers from agni.snapshot_meta where id = 1");
  const loadedBuiltAt = cur[0]?.layers?.industrialSites?.builtAt;
  const have = Number((await db.$queryRawUnsafe<Array<{ n: bigint }>>("select count(*) as n from agni.industrial_site"))[0].n);
  if (!force && have > 0 && loadedBuiltAt === layer.builtAt) {
    console.log(`industrial sites up to date (${have})`);
    return;
  }
  console.log(`loading ${layer.sites.length} industrial sites…`);
  await db.$executeRawUnsafe("TRUNCATE agni.industrial_site");
  let n = 0;
  for (const part of chunks(layer.sites, BATCH)) {
    const rows = part.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      lat: s.lat,
      lon: s.lon,
      geojson: JSON.stringify(s.ring && s.ring.length >= 4 ? { type: "Polygon", coordinates: [s.ring] } : { type: "Point", coordinates: [s.lon, s.lat] }),
    }));
    await db.$executeRawUnsafe(
      `INSERT INTO agni.industrial_site (id, name, category, lat, lon, geom)
       SELECT x.id, x.name, x.category, x.lat, x.lon, ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(x.geojson), 4326))
       FROM jsonb_to_recordset($1::jsonb) AS x(id text, name text, category text, lat float8, lon float8, geojson text)
       ON CONFLICT (id) DO NOTHING`,
      JSON.stringify(rows)
    );
    n += rows.length;
    process.stdout.write(`\r  ${n}/${layer.sites.length}`);
  }
  console.log();
  await db.$executeRawUnsafe("ANALYZE agni.industrial_site");
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (put it in .env).");
  const snap = readSnapshot();
  if (!snap) throw new Error("No snapshot found. Run `npm run build:snapshot` first.");
  const run = (await db.$queryRawUnsafe<Array<{ id: bigint }>>("INSERT INTO agni.ingest_run (kind) VALUES ('db-load') RETURNING id"))[0].id;
  const t0 = Date.now();
  try {
    await loadSites(process.argv.includes("--sites"));

    // hotspots (upsert)
    console.log(`loading ${snap.hotspots.length} hotspots…`);
    for (const part of chunks(snap.hotspots, BATCH)) {
      const rows = part.map((h) => ({
        id: h.id, source: h.source, acq_date: h.acqDate, acq_time: h.acqTime, lat: h.lat, lon: h.lon, geojson: pointGeoJson(h.lon, h.lat),
        frp: h.frp, brightness: h.brightness, bright_t31: h.brightT31, day_night: h.dayNight, detection_confidence: h.detectionConfidence ?? null,
        class: h.class, subtype: h.subtype, confidence: h.confidence, land_cover: h.landCover,
        site_id: h.site?.id ?? null, site_name: h.site?.name ?? null, site_category: h.site?.category ?? null, site_distance_m: h.site?.distanceM ?? null,
        days_active: h.history.daysActive, observed_days: h.history.observedDays, frp_median: h.history.frpMedian, frp_samples: h.history.frpSamples,
        first_seen: h.history.firstSeen, last_seen: h.history.lastSeen,
      }));
      await db.$executeRawUnsafe(
        `INSERT INTO agni.hotspot (id, source, acq_date, acq_time, lat, lon, geom, frp, brightness, bright_t31, day_night, detection_confidence, class, subtype, confidence, land_cover,
           site_id, site_name, site_category, site_distance_m, days_active, observed_days, frp_median, frp_samples, first_seen, last_seen, classifier_version, snapshot_generated_at)
         SELECT x.id, x.source, x.acq_date, x.acq_time, x.lat, x.lon, ST_SetSRID(ST_GeomFromGeoJSON(x.geojson), 4326), x.frp, x.brightness, x.bright_t31, x.day_night, x.detection_confidence, x.class, x.subtype, x.confidence, x.land_cover,
           x.site_id, x.site_name, x.site_category, x.site_distance_m, x.days_active, x.observed_days, x.frp_median, x.frp_samples, x.first_seen, x.last_seen, $2, $3::timestamptz
         FROM jsonb_to_recordset($1::jsonb) AS x(id text, source text, acq_date date, acq_time text, lat float8, lon float8, geojson text, frp real, brightness real, bright_t31 real, day_night text, detection_confidence text,
           class text, subtype text, confidence text, land_cover text, site_id text, site_name text, site_category text, site_distance_m int, days_active int, observed_days int, frp_median real, frp_samples int, first_seen date, last_seen date)
         ON CONFLICT (id) DO UPDATE SET
           class = EXCLUDED.class, subtype = EXCLUDED.subtype, confidence = EXCLUDED.confidence, land_cover = EXCLUDED.land_cover, detection_confidence = EXCLUDED.detection_confidence,
           brightness = EXCLUDED.brightness, bright_t31 = EXCLUDED.bright_t31, site_id = EXCLUDED.site_id, site_name = EXCLUDED.site_name, site_category = EXCLUDED.site_category,
           site_distance_m = EXCLUDED.site_distance_m, days_active = EXCLUDED.days_active, observed_days = EXCLUDED.observed_days, frp_median = EXCLUDED.frp_median,
           frp_samples = EXCLUDED.frp_samples, first_seen = EXCLUDED.first_seen, last_seen = EXCLUDED.last_seen,
           classifier_version = EXCLUDED.classifier_version, snapshot_generated_at = EXCLUDED.snapshot_generated_at`,
        JSON.stringify(rows), snap.classifierVersion, snap.generatedAt
      );
    }

    // persistent sources (replace)
    console.log(`loading ${snap.sources.length} persistent sources…`);
    await db.$executeRawUnsafe("TRUNCATE agni.persistent_source");
    for (const part of chunks(snap.sources, BATCH)) {
      const rows = part.map((s) => ({ ...s, geojson: pointGeoJson(s.lon, s.lat) }));
      await db.$executeRawUnsafe(
        `INSERT INTO agni.persistent_source (id, lat, lon, geom, class, subtype, confidence, site_name, site_category, days_active, window_days, first_seen, last_seen, frp_median, frp_p90, last_frp, detections, land_cover, latest_date, snapshot_generated_at)
         SELECT x.id, x.lat, x.lon, ST_SetSRID(ST_GeomFromGeoJSON(x."geojson"), 4326), x.class, x.subtype, x.confidence, x."siteName", x."siteCategory", x."daysActive", x."windowDays", x."firstSeen", x."lastSeen", x."frpMedian", x."frpP90", x."lastFrp", x.detections, x."landCover", $2::date, $3::timestamptz
         FROM jsonb_to_recordset($1::jsonb) AS x(id text, lat float8, lon float8, "geojson" text, class text, subtype text, confidence text, "siteName" text, "siteCategory" text, "daysActive" int, "windowDays" int, "firstSeen" date, "lastSeen" date, "frpMedian" real, "frpP90" real, "lastFrp" real, detections int, "landCover" text)`,
        JSON.stringify(rows), snap.latestDate, snap.generatedAt
      );
    }

    // triage (upsert; status is deliberately not in the UPDATE list)
    console.log(`loading ${snap.triage.length} triage items…`);
    for (const part of chunks(snap.triage, BATCH)) {
      const rows = part.map((t) => ({ ...t, geojson: pointGeoJson(t.lon, t.lat) }));
      await db.$executeRawUnsafe(
        `INSERT INTO agni.triage_item (triage_key, hotspot_id, class, confidence, priority, lat, lon, geom, acq_date, acq_time, frp, detections, site_name, site_category, distance_m, headline, score)
         SELECT x.key, x.id, x.class, x.confidence, x.priority, x.lat, x.lon, ST_SetSRID(ST_GeomFromGeoJSON(x.geojson), 4326), x."acqDate", x."acqTime", x.frp, x.detections, x."siteName", x."siteCategory", x."distanceM", x.headline, x.score
         FROM jsonb_to_recordset($1::jsonb) AS x(key text, id text, class text, confidence text, priority text, lat float8, lon float8, geojson text, "acqDate" date, "acqTime" text, frp real, detections int, "siteName" text, "siteCategory" text, "distanceM" int, headline text, score real)
         ON CONFLICT (triage_key) DO UPDATE SET
           hotspot_id = EXCLUDED.hotspot_id, class = EXCLUDED.class, confidence = EXCLUDED.confidence, priority = EXCLUDED.priority, lat = EXCLUDED.lat, lon = EXCLUDED.lon, geom = EXCLUDED.geom,
           acq_time = EXCLUDED.acq_time, frp = EXCLUDED.frp, detections = EXCLUDED.detections, site_name = EXCLUDED.site_name, site_category = EXCLUDED.site_category,
           distance_m = EXCLUDED.distance_m, headline = EXCLUDED.headline, score = EXCLUDED.score, updated_at = now()`,
        JSON.stringify(rows)
      );
    }

    // snapshot meta
    await db.$executeRawUnsafe(
      `INSERT INTO agni.snapshot_meta (id, generated_at, latest_date, classifier_version, observed_dates, hotspot_dates, counts, layers)
       VALUES (1, $1::timestamptz, $2::date, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb)
       ON CONFLICT (id) DO UPDATE SET generated_at = EXCLUDED.generated_at, latest_date = EXCLUDED.latest_date, classifier_version = EXCLUDED.classifier_version,
         observed_dates = EXCLUDED.observed_dates, hotspot_dates = EXCLUDED.hotspot_dates, counts = EXCLUDED.counts, layers = EXCLUDED.layers, loaded_at = now()`,
      snap.generatedAt, snap.latestDate, snap.classifierVersion, JSON.stringify(snap.observedDates), JSON.stringify(snap.hotspotDates), JSON.stringify(snap.counts), JSON.stringify(snap.layers)
    );
    await db.$executeRawUnsafe("ANALYZE agni.hotspot");

    const summary = { hotspots: snap.hotspots.length, sources: snap.sources.length, triage: snap.triage.length, ms: Date.now() - t0 };
    await db.$executeRawUnsafe("UPDATE agni.ingest_run SET finished_at = now(), status = 'ok', rows = $2::jsonb WHERE id = $1", run, JSON.stringify(summary));
    console.log("done", summary);
  } catch (e) {
    await db
      .$executeRawUnsafe("UPDATE agni.ingest_run SET finished_at = now(), status = 'failed', detail = $2 WHERE id = $1", run, String(e instanceof Error ? e.message : e).slice(0, 500))
      .catch(() => {});
    throw e;
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e).replace(/postgres(ql)?:\/\/\S+/g, "<url>"));
  process.exit(1);
});
