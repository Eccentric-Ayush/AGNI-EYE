# Architecture

Two sections: **current** (what is in the repo today) and **target** (what the MVP in `MVP_SPEC.md` requires). Do not describe target items as existing.

## 1. Current architecture

```
Browser (Next.js App Router, single page)
  └─ TanStack Query hooks (src/hooks/use-nasa.ts)
        │ fetch
        ▼
Next.js route handlers (src/app/api/*)
  ├─ /api/fires          ──► src/lib/nasa/gibs.ts   (GIBS MVT tiles → decode → FireFeature)
  │                      └─► src/lib/nasa/firms.ts  (optional FIRMS area CSV, needs MAP_KEY; falls back to GIBS)
  ├─ /api/eonet/events   ──► src/lib/nasa/eonet.ts
  ├─ /api/sources/status ──► live probes of GIBS / EONET / FIRMS / imagery
  ├─ /api/settings, /api/firms/validate ──► Setting table (FIRMS MAP_KEY)
  ├─ /api/watchlist(+/[id]) ──► WatchRegion
  ├─ /api/alerts, /api/alerts/scan ──► FireAlert (FRP-threshold severity)
  └─ /api/health
In-process: src/lib/nasa/cache.ts (TTL map, stale-while-error), registry.ts (dedupe, stats)
DB: Prisma (provider "postgresql" via DATABASE_URL) — Setting, WatchRegion, FireAlert
```

### Data flow: `/api/fires`
1. Parse filters: `sources`, bbox (`west,south,east,north`), `date`, `days` (1–7), `dayNight`, `minFrp`, `backend`.
2. Cache lookup (5-min TTL; stale entry kept for errors).
3. `backend=firms` with a key → FIRMS CSV; otherwise/on failure → GIBS.
4. GIBS: for each source × date, compute tiles covering the bbox on the EPSG:4326 grid (non-standard grid sizes; MODIS 1 km TMS zoom 0–6, VIIRS 500 m TMS zoom 0–7; max 64 tiles), fetch gzip MVT, decode points in pure TS → `FireFeature` (attrs: LATITUDE, LONGITUDE, BRIGHTNESS, BRIGHT_T31, FRP, SCAN, TRACK, ACQ_DATE, ACQ_TIME, SATELLITE, CONFIDENCE, VERSION, DAYNIGHT).
5. Dedupe (`satellite|date|time|lat3|lon3`), filter, sort by FRP desc, cap 12,000, aggregate stats, cache, return.

### Known architectural limits
- Stateless: nothing but alerts is stored → no history, baselines, persistence or replay.
- Per-instance memory cache is ineffective on serverless.
- No spatial database; no auth; write routes are open.
- `db/custom.db` (SQLite) and the Postgres schema disagree; `db.ts` logs all queries.

## 2. Target architecture (MVP)

```
            ┌───────────────┐  schedule (Vercel Cron / host cron) + CRON_SECRET
            │ /api/cron/ingest │◄────────────────────────────────────────────
            └──────┬────────┘
   GIBS tiles / FIRMS CSV (VIIRS 375 m, India bbox)
                   ▼
            normalise + dedupe ──► hotspot (PostGIS)
                   ▼
   thermal_cell update (distinct-day recurrence, FRP baseline)
                   ▼
   classify(hotspot, cell, nearest industrial_site, landuse)  ── src/lib/classify/*
                   ▼
   hotspot.class/confidence/reasons  +  triage_item (for anomalies)

 Offline, run locally, result loaded to DB (not at request time):
   scripts/build-industrial-layer  — OSM Overpass extract for India → industrial_site
   scripts/build-validation-set    — verified sites → validation_site
   scripts/evaluate                — classifier vs validation_site → metrics JSON shown in app

 Read path:
   /api/hotspots?bbox&since&class      GeoJSON of stored, classified hotspots
   /api/hotspots/[id]/evidence         reasons, nearest site, recurrence series, baseline
   /api/layers/industrial?bbox         GeoJSON of industrial sites
   /api/sites(.csv|.geojson)           persistent-thermal-source register
   /api/triage (GET, PATCH status)     queue
   /api/fires                          unchanged raw feed (also used for "Raw" toggle and as fallback)
   /api/replay                         served from stored snapshot when upstream fails / REPLAY mode
```

### Module layout to add
```
src/lib/classify/
  config.ts       thresholds, buffers, class ids (one place)
  features.ts     build feature vector for a hotspot
  rules.ts        ordered evidence rules → {class, confidence, reasons[]}
  index.ts        classify()
  *.test.ts       fixtures per class and per edge case
src/lib/geo/      cell id (grid/H3), distance helpers, bbox utils
src/lib/db-spatial.ts  $queryRaw helpers (ST_DWithin, ST_Intersects, GiST-backed)
```

### Decisions and trade-offs
| Decision | Choice | Why | Alternative |
|---|---|---|---|
| Runtime | Stay TypeScript/Next for MVP | Working app; one deploy; classifier is rules, not heavy compute | Python FastAPI worker + GeoPandas (matches deck; adds a second service) |
| Spatial store | Postgres + PostGIS (managed) | Deliverable 2 is literally GIS storage; GiST index for proximity | SQLite + SpatiaLite (not Vercel-friendly) |
| Classifier | Rule-based evidence scoring with reason codes | No ground truth; explainable; testable | ML on weak labels (circular; see SIH_ALIGNMENT §5) |
| Industrial data | Pre-extracted OSM India layer | Overpass is rate-limited/slow at request time | Live Overpass (unreliable) |
| Recurrence | Distinct **days** per cell | Multiple satellites overpass the same site | Raw row counts (inflate) |
| Raw vs classified | Both retained; toggle | Shows the problem and the solution side by side | — |

### Reliability and security requirements
- Ingestion is idempotent (unique key on `satellite, acq_at, lat, lon`) and recorded in `ingest_run`.
- All non-GET routes and `/api/cron/*` require a secret header; FIRMS key from env only; rate-limit `/api/fires`.
- Upstream failure → serve last stored data with a visible "stale since …" badge or REPLAY; never an empty blank map.
- Replay data must be **real archived detections**, labelled REPLAY. No synthetic data anywhere.

### Observability
Structured logs per ingest (rows, tiles failed, ms); `/api/health` reports last successful ingest time and row counts.

## 3. Status update — what is built (2026-09-30)

```
GIBS tiles ──ingest──► data/raw (git-ignored) ──build:snapshot──► data/snapshot/latest.json.gz ──db:load──► Postgres+PostGIS (schema agni)
OSM Overpass ─build:industrial─► data/industrial-india.json.gz ───────────────────────────────db:load──►   agni.industrial_site (GiST)
                                                                                                          agni.hotspot / persistent_source / triage_item / snapshot_meta / ingest_run
Read APIs:  PostGIS first  ──(unset | unreachable | AGNI_STORE=files)──►  file snapshot fallback     (every response carries store: "postgis" | "files")
```

- **Classification still runs in TypeScript** at build time (`src/lib/classify`, `SiteIndex`); the database stores results and serves reads. PostGIS is used at read time for bbox queries (GiST `&&`), true-distance `nearbyFacilities` (geography `ST_DWithin`), aggregation, and shared triage state.
- **Schema `agni` is separate from Prisma's `public`** so `prisma db push --accept-data-loss` cannot drop it. SQL migrations live in `db/sql/` and are applied by `npm run db:setup` (recorded in `agni.schema_migrations`).
- **Idempotent loads:** hotspots `ON CONFLICT (id) DO UPDATE` (history accumulates); persistent sources are replaced; triage items upsert on the stable key `<date>|<cell>` and **never overwrite `status`**, so analyst decisions survive re-classification.
- **Resilience:** `tryDb()` marks the DB not-ready for 30 s on any error and callers fall back to files; verified with a dead database address (200 from files, fast on subsequent calls, no credentials in logs).
- **Verification:** `npm run db:verify` compares 16 aggregates between PostGIS and the source snapshot (all passing on 2026-09-30).
- **Write access:** `PATCH /api/triage` requires `x-admin-secret` (`ADMIN_SECRET`); the UI keeps the analyst key in `sessionStorage` only.

Not yet: scheduled `db:load` in CI, classification inside the database, spatial joins for the persistent-source register, per-user identity (status changes are not attributed to a person).
