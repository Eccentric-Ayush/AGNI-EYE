# AGNI-EYE MVP Specification

Goal: directly satisfy SIH26162's two deliverables — (1) classification/segregation of industrial fires from forest and other fires, (2) GIS storage and map-overlay visualisation — and make that demonstrable in under three minutes.

Status legend: **Have** = exists in repo; **Build** = must be built; **Later** = not in MVP.

## 1. One-sentence product

> Every satellite hotspot over India, automatically labelled (industrial fire, persistent industrial source, crop burn, vegetation fire, other static, unclassified), with the evidence behind each label, stored as a GIS layer, and reduced to a short triage queue of things that are *not* routine.

## 2. Class taxonomy (single source of truth)

| Class id | Meaning | Typical evidence |
|---|---|---|
| `industrial_anomaly` | Hotspot at/near an industrial site that is **new or well above that site's own baseline** — possible accident | within buffer of industrial feature; low prior recurrence or FRP z-score high |
| `industrial_persistent` | Routine, repeating industrial heat (flare, kiln, furnace, plant) | within buffer of industrial feature; detected on many distinct days; FRP near baseline |
| `agricultural_burn` | Crop residue burning | cropland/farmland context; small FRP; afternoon pass; seasonal; no industrial proximity |
| `vegetation_fire` | Forest/scrub/grass fire | forest/natural land cover; no industrial proximity; not persistent |
| `other_static` | Non-industrial persistent or special source | landfill, coal-seam/mine fire, volcano, offshore (FIRMS `type` 1/2/3 where available) |
| `unclassified` | Not enough evidence | **Never force a label.** Shown distinctly. |

Every classified hotspot carries `confidence` (`low|medium|high`) and `reasons[]` — machine codes plus a plain-language sentence (e.g. `NEAR_INDUSTRIAL: 340 m from "…" (oil refinery)`, `RECURRENCE: detected on 22 of last 30 days`, `FRP_SPIKE: 4.1× site median`).

## 3. Must-have MVP features (demo-critical)

| # | Feature | Acceptance criterion | Status (2026-09-30) |
|---|---|---|---|
| M1 | India-scoped hotspot ingestion, **stored** | Ingest writes VIIRS 375 m hotspots for India with time, position, FRP, brightness, day/night; idempotent re-run | **Done, except scheduling.** `npm run ingest` (GIBS, India, 3 VIIRS satellites, incremental) → classified snapshot → `npm run db:load` upserts into PostGIS (`agni.hotspot`, GiST-indexed; history accumulates across loads). Scheduled refresh not yet exercised |
| M2 | Industrial infrastructure layer | India OSM industrial/energy/mining features preloaded and queryable by distance | **Built** as `npm run build:industrial` (Overpass → `data/industrial-india.json.gz`) with in-memory `SiteIndex`; coverage flag shows if the layer is partial |
| M3 | Persistence / baseline per thermal cell | Distinct-day recurrence, FRP baseline per ~555 m cell (3×3 neighbourhood) | **Built** (`src/lib/pipeline/recurrence.ts`, tested). Window = 30 days of GIBS history |
| M4 | Rule-based evidence-scoring classifier | Class + confidence + reasons, versioned, unit-tested | **Built** (`src/lib/classify/*`, `rules-0.1.0`; thresholds in `config.ts`, untuned) |
| M5 | Class-coloured map overlays | Hotspots by class, industrial sites, persistent sources; legend; colour + shape | **UI in progress** (see git status); APIs built: `/api/hotspots`, `/api/layers/industrial` |
| M6 | Evidence panel per hotspot | Class, confidence, reasons, facility, recurrence, FRP vs baseline, source/time, imagery link | API **built** (`/api/hotspots/[id]`); UI in progress |
| M7 | Triage queue | Ranked non-routine items, acknowledge/dismiss | **Built.** Two tiers (`review` = medium/high confidence, counted as "needs attention"; `watch` = low confidence, collapsed under "Lower priority"). Acknowledge/dismiss is stored in PostGIS (`triage_item.status`, shared) when the analyst key is entered; otherwise browser-local, and the UI says which |
| M8 | Persistent-thermal-source register | Table + CSV/GeoJSON export | API **built** (`/api/sites?format=csv|geojson`); UI in progress |
| M9 | "Noise reduction" KPI | raw → classified → needs attention | API **built** (`totals` in `/api/hotspots`); UI in progress |
| M10 | Honest validation | Confusion matrix on 20–30 **externally verified** sites | Tooling **built** (`npm run evaluate`, `/api/validation`, Validation tab). **6 documentary sites** (public records) recorded 2026-09-30: exact-class match 3/6, industrial-vs-other 5/6 — a smoke test, not a validation. Missing: imagery-verified crop-burn, vegetation-fire and industrial-anomaly sites |
| M11 | Replay mode | Real archived snapshot, clearly labelled, never mixed with live | **Built as the data model:** the app serves the stored snapshot and reports `freshness: live|archived` from its age |
| M12 | Reliability basics | States, auth on write routes, `tsc` clean, tests | `tsc` clean, 27 unit tests, `x-admin-secret` guard on write routes, `ignoreBuildErrors` removed. Rate limiting and smoke tests not done |

## 4. Secondary (only after M1–M12)

- Land-cover raster (ESA WorldCover) sampling to replace OSM landuse as a proxy.
- VIIRS Nightfire flare catalogue (requires free EOG account; check licence) as an additional persistent-source feed.
- Second-stage ML classifier evaluated on the held-out verified set; SHAP only if it adds information beyond the reason codes.
- Bilingual (English/Hindi) incident report / PDF export.
- Webhook/email/WhatsApp alerting, OpenAQ air-quality correlation, user accounts/roles.
- Watch regions ("areas of interest") and per-user saved views.

## 5. Explicitly out of MVP

Global classification, MODIS-based classification, mobile-native app, real-time streaming infra, multi-tenant admin, complex auth.

## 6. Demo flow (3 minutes)

1. **Problem (20 s).** Open on the raw view: "FIRMS shows N dots across India; analysts can't tell which matter." (Toggle "Raw" to show undifferentiated hotspots.)
2. **Solution (40 s).** Switch to "Classified": dots recolour; headline KPI "N raw → M needing attention".
3. **Proof (60 s).** Click an `industrial_persistent` flare: evidence shows 340 m from a refinery, 26/30 days, FRP at baseline → "routine". Click an `industrial_anomaly`: new/spiking, reasons listed, SWIR link. Click a stubble cluster and a forest fire for contrast.
4. **Workflow (30 s).** Triage queue → acknowledge → register → export GeoJSON.
5. **Trust (30 s).** Validation card with honest numbers and limits; REPLAY badge shows what happens offline.

## 7. Data model (target)

```
hotspot(id, source, satellite, acq_at, geom Point4326, frp, brightness, bright_t31, confidence_raw,
        day_night, cell_id, class, confidence, reasons jsonb, classifier_version, ingested_at)
industrial_site(id, osm_type, osm_id, name, category, geom Geometry4326, tags jsonb)
thermal_cell(cell_id, geom, first_seen, last_seen, days_active_30, days_active_90,
             frp_median, frp_p90, nearest_site_id, class)
triage_item(id, hotspot_id, reason, status[open|ack|dismissed], created_at, updated_at)
ingest_run(id, started_at, finished_at, source, rows_upserted, status, error)
validation_site(id, name, geom, true_class, evidence_url, verified_by, verified_at)
```
Keep `Setting` and `WatchRegion`; retire `FireAlert` in favour of `triage_item`. Prisma cannot model PostGIS geometry natively — use `Unsupported("geometry")` columns plus `$queryRaw`/SQL migrations for spatial queries and GiST indexes.

## 8. Classification v1 — decision outline

Inputs per hotspot: `d_industrial` (m to nearest site, buffer ≈ 500 m to tune), `site_category`, `days_active_30`, `frp`, `frp_vs_cell_median`, `landuse` (OSM farmland/forest/landfill/quarry), local overpass hour, month, day/night, FIRMS `type` when present.

1. FIRMS static flags / volcano / offshore → `other_static` (high confidence).
2. Within buffer of industrial/energy/mining site:
   - mining or landfill category → `other_static`
   - high recurrence and FRP ≤ ~2× cell median → `industrial_persistent`
   - low recurrence, or FRP ≥ ~3× cell median → `industrial_anomaly`
3. Not near industry: farmland + small FRP + afternoon + season → `agricultural_burn`; forest/natural → `vegetation_fire`.
4. Conflicting or missing evidence → `unclassified`.

Thresholds above are **starting values** to be tuned on the validation set, not claims. Keep them in one config module with tests.

## 9. Definition of done for the MVP

- Fresh clone + documented env → app runs; ingestion job populates the DB; classified map renders for India.
- All M-items meet their acceptance criteria; `npx tsc --noEmit` and `npm run lint` pass; classifier has unit tests; validation numbers reproducible via a script.
- Deck updated so every claim is either implemented or labelled "planned".
