# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

@AGENTS.md

## What this project is for

AGNI-EYE is a Smart India Hackathon 2026 entry for **SIH26162 (NTRO)**: *AI-based detection and classification of industrial fires and persistent thermal sources using NASA FIRMS, OSM & satellite data.* Official deliverables: **(1)** classify/segregate industrial fires from forest and other natural fires; **(2)** a GIS-based solution storing data and showing output as map overlays. Target users: NTRO analysts, NDMA/NDRF/SDRF, pollution control boards.

**The goal of all work here is a credible, demonstrable MVP of that problem — not a better generic wildfire map.** Judge every change by whether it helps classify, explain, store, or map thermal sources over India.

## Truth about current state (read before planning)

**Built (verified):** India-scoped ingestion of VIIRS 375 m detections from NASA GIBS (`npm run ingest`); OSM industrial-facility layer builder (`npm run build:industrial`, Overpass, resumable; coverage flag shows if partial); ESA WorldCover land-cover sampling (cached); distinct-day recurrence index; rule-based evidence classifier with reasons (`src/lib/classify`, `rules-0.1.0`, thresholds untuned); snapshot builder (`npm run build:snapshot`) producing classified hotspots, a persistent-source register and a deduplicated triage queue; read APIs (`/api/hotspots`, `/api/hotspots/[id]`, `/api/triage`, `/api/sites` + CSV/GeoJSON, `/api/layers/industrial`, `/api/pipeline/status`, `/api/validation`); triage-first UI (`src/components/agni/*`); validation tooling (`npm run evaluate`); admin-secret guard on write routes; 28 unit tests; `tsc` and `next build` clean; triage has two tiers (`review` = medium/high confidence and counted as "needs attention"; `watch` = low confidence, shown under "Lower priority").
**Storage (built):** a Neon Postgres + PostGIS 3.6 database (`.env` `DATABASE_URL`, pooled endpoint) holds the spatial store in its own schema `agni` (`db/sql/001_init.sql`: `hotspot`, `industrial_site`, `persistent_source`, `triage_item`, `snapshot_meta`, `ingest_run`, GiST indexes). `npm run db:setup` applies the SQL, `npm run db:load` loads the snapshot + industrial layer (hotspots upsert so history accumulates; triage upsert never overwrites analyst status), `npm run db:verify` cross-checks DB vs files. Read routes prefer PostGIS (`src/lib/store/postgres.ts`, response carries `store: "postgis"`) and fall back to the `data/` files (`store: "files"`) if the DB is unset, unreachable or `AGNI_STORE=files`. Shared triage acknowledge: `PATCH /api/triage` (needs `x-admin-secret`); the UI asks for the analyst key and falls back to browser-local status.
**Not built / open:** scheduled DB refresh (the GitHub workflow has never run); a DB-side facility match at classification time (classification still runs in TS with `SiteIndex`; the DB only serves reads and `nearbyFacilities`); **validation is only a 6-site documentary smoke test (exact class 3/6, industrial-vs-other 5/6; no crop-burn/vegetation/anomaly sites, none imagery-verified) — do not present it as an accuracy figure**; classifier thresholds are a-priori and untuned; ML/SHAP, Sentinel-2 verification, Nightfire, bilingual reports, rate limiting; the scheduled-refresh workflow `.github/workflows/refresh-data.yml` has never run. The legacy viewer code (`src/components/command/*`, `/api/fires`, `/api/alerts*`, `/api/watchlist*`) is still present but no longer used by the page.
The presentation deck (`AGNI-EYE_SIH2026_Presentation.pdf`) still describes Python/PostGIS/Random Forest/SHAP/DBSCAN/Nightfire/Sentinel-2 — **those are not implemented**; do not describe them as such.
Known data caveat: VIIRS 375 m GIBS tiles use `BRIGHT_TI4`/`BRIGHT_TI5` and a textual `CONFIDENCE` (low/nominal/high) — handled in `gibs.ts`; raw data ingested before 2026-09-30 lacks them and must be re-ingested with `--force`.

Docs (read the relevant one before working in that area):
- `docs/SIH_ALIGNMENT.md` — problem statement, gap analysis, findings
- `docs/MVP_SPEC.md` — must-have features M1–M12, class taxonomy, data model, demo flow
- `docs/ARCHITECTURE.md` — current vs target architecture, data flow
- `docs/UI_UX_GUIDELINES.md` — UI review, target layout, accessibility
- `docs/PRESENTATION_STRATEGY.md` — demo/deck strategy
- `docs/DEVELOPMENT.md` — setup, conventions, integrity rules

## Commands

- `npm run dev` — Next.js dev server on port 3000
- `npm run build` — `prisma generate && next build` (also runs on `postinstall`)
- `npm run lint` — ESLint
- `npm run start` — serve the production build
- `npm run test` (Vitest) · `npm run typecheck` — run both before finishing a change
- Pipeline: `npm run ingest -- --days 30 [--force]` → `npm run build:industrial [-- --from-cache]` → `npm run build:snapshot [-- --no-landcover]` → `npm run evaluate`; `npm run build:boundary` rebuilds the India clip polygon
- `npm run db:setup` · `db:load` · `db:verify` — PostGIS store (see above; `--env-file-if-exists=.env` is built in). Legacy Prisma scripts `db:push` / `db:migrate` / `db:reset` only manage schema `public` (the old Setting/WatchRegion/FireAlert models, unused by the new UI) and `db:push` runs with `--accept-data-loss`; the `agni` schema is deliberately outside Prisma's reach.
- Tests live beside code (`*.test.ts`): classifier, recurrence index, snapshot builder. GIBS tile math is still untested.

`ignoreBuildErrors` has been removed, so `next build` now fails on type errors; still run `npx tsc --noEmit` while editing. `output: "standalone"` is deliberately disabled (Vercel build fix). `AGENTS.md` warns this Next.js version differs from training data: read `node_modules/next/dist/docs/` (after `npm install`) before writing routing/caching/config code.

## Architecture (current)

Next.js 16 App Router single page, Tailwind 4, shadcn/ui, Prisma, Leaflet, Recharts, TanStack Query. Imports use `@/*` → `src/*`.

**Data layer `src/lib/nasa/`**
- `gibs.ts`: default hotspot source; fetches GIBS active-fire **MVT** tiles (no key), decodes with a pure-TS decoder → `FireFeature` GeoJSON. EPSG:4326 with non-standard grid sizes; MODIS 1 km TMS (zoom 0–6), VIIRS 500 m TMS (zoom 0–7). Takes a `date`, so past days are fetchable.
- `firms.ts`: optional FIRMS area CSV (needs `MAP_KEY`); `/api/fires` falls back to GIBS automatically.
- `eonet.ts` EONET wildfire events · `registry.ts` sources, dedupe, stats · `cache.ts` in-memory TTL + stale-while-error · `settings.ts` resolves FIRMS key from DB `Setting` or env.

**API `src/app/api/*`:** `fires` (filters `sources`, bbox, `date`, `days` ≤ 7, `dayNight`, `minFrp`; 5-min cache; 12k cap), `eonet/events`, `sources/status`, `settings`, `firms/validate`, `health`, `watchlist` (CRUD), `alerts` + `alerts/scan`.

**Frontend:** `src/app/page.tsx` composes `src/components/command/*` (map, filters, stats, charts, table, alerts, settings). Hooks in `src/hooks/use-nasa.ts`; shared types in `src/lib/types.ts`. `src/components/ui/*` is stock shadcn — don't hand-edit.

**Database:** Postgres + PostGIS on Neon. `prisma/schema.prisma` (provider `postgresql`) only describes the legacy `public` tables; the spatial store is raw SQL in schema `agni` accessed via `$queryRaw` (Prisma cannot model geometry). `db/custom.db` is a stale SQLite leftover. The pooled URL is fine for the app; if you ever run `prisma migrate`, add the direct URL.

**Deployment:** Vercel is the target (`agni-eye.vercel.app`). `Caddyfile` and `.zscripts/` are legacy sandbox tooling; `mini-services/` is empty.

## Target architecture (to build)

Scheduled ingest → PostGIS `hotspot` table → per-cell recurrence/baseline → rule-based evidence classifier (`src/lib/classify/*`) → class-coloured overlays, evidence panel, triage queue, persistent-source register, GeoJSON/CSV export. Offline scripts build the OSM India industrial layer and the validation set. Details in `docs/ARCHITECTURE.md`.

Class ids: `industrial_anomaly`, `industrial_persistent`, `agricultural_burn`, `vegetation_fire`, `other_static`, `unclassified`. Each result = class + confidence + reasons. Defined in `docs/MVP_SPEC.md` — keep that the single source of truth.

## Rules

1. **No simulated or fabricated data**, ever. A replay dataset must be real archived detections, labelled REPLAY, never mixed with live.
2. Never force a label: insufficient evidence → `unclassified`. Never show a class without confidence and reasons.
3. Do not state accuracy/validation numbers not produced by the evaluation script on the held-out verified set. Do not cite real-world incidents you have not verified.
4. Classification is pure, deterministic, versioned and unit-tested; thresholds live only in `src/lib/classify/config.ts`.
5. Classify on VIIRS 375 m only; MODIS is context. Recurrence counts **distinct days**, not rows (multiple satellites overpass).
6. Spatial work in PostGIS with parameterised SQL (`$1…` placeholders via `$queryRawUnsafe(sql, ...params)`); never interpolate user input into SQL. Format dates in SQL (`to_char`), not in JS.
7. Validate/clamp all API params; all non-GET and cron routes need a secret; keep secrets in env, not the DB or repo.
8. UI follows `docs/UI_UX_GUIDELINES.md`: triage-first, class encoded by colour **and** shape, min 12 px text, explicit loading/empty/error/stale states.
9. Prefer changes that advance MVP items M1–M12; demote (don't delete) non-MVP UI such as global presets, source toggles and generic charts.
10. Update the relevant doc when behaviour or architecture changes.

## Git

Branch `fix/improve-UI-UX-Design` is the current working branch (from `main`). Commit only when asked. Do not commit `.env*`, keys or DB files. When parsing `.env` in scripts, honour quotes and trailing `# comments` the way dotenv does (a naive split leaks the comment into the value).
