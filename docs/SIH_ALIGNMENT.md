# SIH 2026 Alignment Review — AGNI-EYE vs. SIH26162

Status: review of the prototype and `AGNI-EYE_SIH2026_Presentation.pdf` against the official problem statement.
Reviewed: 2026-09-30. Everything in "What the code does" was verified by reading the repository; everything in "Official problem statement" comes from the public mirrors listed at the bottom (the sih.gov.in portal itself was not directly readable).

## 1. Official problem statement

| Field | Value |
|---|---|
| ID | SIH26162 |
| Title | AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources Using NASA FIRMS, OSM & Satellite Data |
| Organisation | National Technical Research Organisation (NTRO) |
| Category / Theme | Software / Disaster Management (one mirror lists "Miscellaneous") |

**Background.** Refineries, petrochemical complexes, thermal power plants, steel plants, mines and LNG terminals emit thermal signatures visible from space. Accidental fires, gas leaks, explosions and abnormal thermal events are a risk to critical infrastructure, safety and the environment.

**Problem.** FIRMS detects thermal anomalies but cannot tell industrial fires, gas flares, agricultural burning, mining activity and wildfires apart. Routine industrial combustion (flares, kilns, furnaces) is conflated with vegetation, forest, stubble or landfill fires. The result is alert fatigue for NTRO analysts and first responders (NDRF/SDRF).

**Ask.** An AI-enabled geospatial system that integrates **thermal anomaly data, land-cover information, industrial infrastructure databases and satellite imagery** to automatically **identify, classify and monitor** industrial fires and persistent thermal sources.

**Expected deliverables (the only two explicit ones):**
1. **Classification and segregation of industrial fires from forest fires and other natural fires.**
2. **GIS-based solution for data storage and visualisation of output as map overlays.**

### Decomposition

- **Target users:** NTRO analysts (strategic monitoring), NDMA/NDRF/SDRF (triage and response), pollution control boards and environment-ministry analysts (repeat violations, compliance).
- **Core job to be done:** "Of today's thousands of hotspots in India, which few are *not* routine, and what is each one?"
- **Success looks like:** a labelled, explained, stored, mappable output — not a raw hotspot map.
- **Constraints implied:** public data (FIRMS, OSM), software-only, India scope, no ground-truth labels, must be defensible to analysts (explainability).

## 2. What the code actually does

AGNI-EYE today is a **live global wildfire hotspot viewer**.

- Ingests NASA GIBS active-fire vector tiles (VIIRS S-NPP/NOAA-20/NOAA-21, MODIS Terra/Aqua/Combined) and optionally the FIRMS area API; EONET incidents; GIBS imagery basemap. (`src/lib/nasa/*`, `src/app/api/fires/route.ts`)
- Shows hotspots on a Leaflet map coloured by brightness and sized by FRP, plus KPI cards, charts, a sortable table, watch regions and alerts. (`src/components/command/*`)
- Persists only `Setting`, `WatchRegion`, `FireAlert` (`prisma/schema.prisma`). **Hotspots themselves are never stored.**
- `FireAlert.severity` is a pure FRP threshold (`src/app/api/alerts/scan/route.ts`). There is no notion of *what* burned.

Evidence that nothing in the solution pitch exists yet: a case-insensitive search of `src/` for `classif|industr|flare|stubble|shap|osm|overpass|worldcover|nightfire|baseline` matches only a region preset in `src/lib/types.ts`.

## 3. Prototype vs. requirements

| Requirement | Status | Evidence / gap |
|---|---|---|
| Ingest FIRMS thermal anomalies | **Done** | GIBS MVT decoder + optional FIRMS CSV; dedupe; cache. Solid. |
| Integrate industrial infrastructure database (OSM) | **Missing** | No OSM data, no spatial join. |
| Integrate land-cover | **Missing** | None. |
| Integrate satellite imagery | **Partial** | GIBS true-colour basemap only; no SWIR verification. |
| **Classify** industrial vs forest vs other (Deliverable 1) | **Missing** | No classifier, no classes, no explanation. |
| Identify persistent sources / baselines | **Missing** | No history is stored, so recurrence is impossible. |
| **GIS storage** (Deliverable 2) | **Missing** | SQL store holds alerts only; no spatial DB or spatial indexing. |
| **Map overlays** of the output (Deliverable 2) | **Partial** | Hotspot markers, EONET, watch rectangles. No overlay of classes, industrial sites or persistent sources. |
| Monitor / alert without fatigue | **Counter-productive** | One scan persisted 5,306 alerts in the worklog run: a raw hotspot dump is exactly the problem statement. |
| India focus | **Weak** | Default region is "South & Southeast Asia"; 10 global presets. |

**Verdict: the prototype partially addresses the *plumbing* (ingest + map) and does not yet address the *problem* (classification + persistent-source intelligence + GIS storage).** Roughly: ingestion 90 %, visualisation 50 %, classification 0 %, storage 10 %.

## 4. Presentation vs. prototype — claims that are not backed

The deck is the submitted idea; the evaluators will compare it to the demo.

| Deck claim | Reality |
|---|---|
| Python, PostgreSQL/PostGIS, GeoPandas, APScheduler | Next.js + Prisma; schema says `postgresql` but no PostGIS; committed `db/custom.db` is SQLite |
| Random Forest + SHAP + DBSCAN | None present |
| OSM Overpass, ESA WorldCover, VIIRS Nightfire, Sentinel-2 SWIR | None present |
| "Bilingual, filable report" with every alert | Not built |
| "Repeat offenders flagged automatically", "leaderboard" | Not built (no history stored) |
| "Cached 60–90 day archive as offline demo fallback" | Not built; the live site showed its empty state ("No detections… top 0 of 0") in the server-rendered HTML I fetched, which may only be the pre-fetch state — verify in a browser |
| "Built entirely on free, **no-login** data" | FIRMS needs a free MAP_KEY; EOG VIIRS Nightfire requires a free account and is a licensed product (free for academics) — check licence terms before relying on it |
| "Detection-to-action time cut from days to minutes" | Unsubstantiated. FIRMS/GIBS latency is hours for most of India; claim *triage* time reduction instead |
| "Validation against Nightfire and Sentinel-2 in progress" | Nothing in the repo; either produce a number or say "planned" |

The deck's own risk slide is honest that no ground-truth labels exist. That is the crux below.

## 5. Weak assumptions

1. **"Random Forest + SHAP" on weak labels is circular.** If labels come from the FIRMS static-source mask / Nightfire list and the features include the same signals, the model reproduces the rules. Another team on the same problem measured cross-validation F1 ≈ 0.996 collapsing to ≈ 0.55 on 21 externally verified events — expect the same. Explainability from SHAP on a rule-reproducing model adds little.
   **Recommendation:** ship a transparent, rule-based **evidence-scoring classifier** with per-hotspot *reason codes*. Add ML only as a documented second stage evaluated on a held-out verified set.
2. **MODIS (1 km) is too coarse to attribute to a facility.** Classify on VIIRS 375 m only; keep MODIS as context.
3. **Counting detections ≠ persistence.** Three VIIRS satellites overpass the same site, so recurrence must count *distinct days*, not rows.
4. **Overpass at request time is not viable on serverless** (rate limits, latency). Pre-extract an India industrial layer offline and store it.
5. **FIRMS itself carries a hint**: the `type` attribute (0 vegetation fire, 1 active volcano, 2 other static land source, 3 offshore). Use it where the product provides it (confirm it is present in the NRT CSV you use; the GIBS vector tiles in this repo do not expose it).

## 6. Unnecessary / distracting for this problem

Global presets (Africa, Americas, Europe…), six per-satellite toggles, FRP-bucket/hourly/day-night donut charts, the EONET tab as a primary panel, the FIRMS MAP_KEY dialog in the main header, the "watch region → alerts" flow as currently built, and the light/dark theme toggle. Keep the code; demote the UI. Several dependencies (`@mdxeditor/editor`, `next-auth`, `next-intl`, `zustand`, `z-ai-web-dev-sdk`, `framer-motion`, etc.) appear unused — confirm with `npx depcheck` before removing.

## 7. Technical and product findings

**Correctness / reliability**
- `next.config.ts` sets `typescript.ignoreBuildErrors: true`; type errors ship silently. Run `npx tsc --noEmit` in CI and fix.
  Verified 2026-09-30 after `npm install`: exactly **2 type errors**, both TS2698 "Spread types may only be created from object types" from calling `cacheGetFresh(...)` without a type argument (`T` infers as `unknown`): `src/app/api/eonet/events/route.ts:19` and `src/app/api/sources/status/route.ts:17`. Fix by passing a type, e.g. `cacheGetFresh<EonetPayload>(...)`; then remove `ignoreBuildErrors`.
- `npm install` reports 10 vulnerabilities (4 moderate, 6 high) and deprecated `recharts@2`, `eslint@9.39`, `intersection-observer`; run `npm audit` and triage before submission. Do not use `npm audit fix --force` blindly (breaking changes).
- In-memory cache (`src/lib/nasa/cache.ts`) is per serverless instance; it will not persist on Vercel and cold starts will re-fetch up to 64 tiles × sources × days.
- `alerts/scan` inserts rows one by one in a loop, unbounded, inside a request; use batched `createMany({ skipDuplicates: true })` — and it should be replaced by triage items.
- `db.ts` logs every SQL query (`log: ['query']`) in production.
- DB provider ambiguity: `schema.prisma` = `postgresql`, worklog and `db/custom.db` = SQLite. Decide (Postgres + PostGIS) and delete the stale file.
- `db:push` uses `--accept-data-loss`; do not run it against a real database.

**Security**
- No authentication or rate limiting on any route. Anyone can `POST /api/settings` (overwrite/clear the FIRMS key), `POST /api/alerts/scan` (trigger heavy upstream fetches), `DELETE /api/alerts`, and CRUD the watchlist. The FIRMS key is stored in plaintext in the DB.
- Minimum for MVP: a shared-secret header for write/admin routes, cron secret for ingestion, per-IP rate limit on `/api/fires`, key from env only.

**Scalability**
- Move from "fetch on every page load" to "ingest on a schedule, store, query the store". This also unlocks history, baselines and offline replay.
- Spatial work belongs in PostGIS (`ST_DWithin`, GiST index), not in JS loops.

**Edge cases that must be handled (India-specific, all real)**
- Seasonal crop burning (Punjab/Haryana stubble, Oct–Nov) near industrial belts.
- Seasonal brick kilns in the Indo-Gangetic plain (Nov–May): persistent *and* seasonal.
- Coal-seam fires (Jharia) and open-cast mines: persistent, not "industrial fire".
- Landfill fires (e.g. Delhi landfills) and waste burning: persistent-ish, non-industrial.
- Offshore flares (Mumbai High) and the Barren Island volcano (Andaman): static, non-land.
- Cloud/monsoon gaps lower recurrence counts; absence of detection ≠ absence of fire.
- Geolocation error: VIIRS pixel offset vs facility geometry — buffer the match (start ~500 m, tune on verified sites).
- Flares cycle on/off; baselines must tolerate intermittent burning.
- Empty result days and upstream outages must show a stale/replay state, never a blank map.

## 8. Is the current prototype a convincing MVP?

**No.** It demonstrates that you can draw NASA hotspots on a map — which FIRMS already does better. It does not demonstrate the thing NTRO asked for. See `docs/MVP_SPEC.md` for the must-have slice that would.

## 9. Decisions the team needs to make

1. **Stack for the MVP.** Recommended: stay on Next.js/TypeScript + Postgres/PostGIS with a TS rule-based classifier, and present Python/ML as offline evaluation tooling — because the working app is already TS and a Python rewrite competes with the demo. If the team wants to honour the deck literally, add a small Python worker (GeoPandas) behind the same tables. Update the deck either way.
2. **Scope:** India only for classification; global remains as a raw-hotspot view.
3. **Hosting of PostGIS:** a managed Postgres with PostGIS (Neon and Supabase both support the extension) keeps Vercel deployment.
4. **Validation set:** agree 20–30 sites/events (known refineries/steel plants/flares, known stubble-burn clusters, known forest fires), each verified by you against Sentinel-2 SWIR. Verify dates and locations yourselves; do not cite events you have not checked.

## 10. Sources

- Problem statement text: zaidsayyed.in/tools/sih-problem-statements/sih26162; sihbuddy.in/ps/SIH26162; NoBugNinja SIH-2026 problem-statement repository.
- FIRMS attribute definitions (`type` field): earthdata.nasa.gov active-fire data attributes (MODIS/VIIRS).
- VIIRS Nightfire access and licensing: eogdata.mines.edu/products/vnf and payneinstitute.mines.edu/eog/viirs-nightfire-vnf.
- Another team's published F1 caveat: github.com/gnanesh-coder/sih26162 (README, as summarised; treat as indicative).
