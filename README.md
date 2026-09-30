# AGNI-EYE

**Site-aware classification and anomaly detection for satellite thermal sources.**
Smart India Hackathon 2026 · Problem statement **SIH26162** (NTRO) — *AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources Using NASA FIRMS, OSM & Satellite Data* · Theme: Disaster Management · Team AGNI-EYE (ID 176695).

## The problem
NASA FIRMS shows where the Earth is hot, not *why*. Industrial flares, kilns and furnaces, crop burning, mining fires, landfills and wildfires all appear as identical dots, so analysts drown in routine hotspots and can miss the genuine industrial accident. SIH26162 asks for an AI-enabled geospatial system that classifies these sources and presents them as GIS map overlays.

## What AGNI-EYE is meant to do
Label every hotspot over India (industrial anomaly · persistent industrial source · agricultural burn · vegetation fire · other static · unclassified), show the evidence behind each label, store everything as a GIS layer, and reduce the day to a short triage queue. See [`docs/MVP_SPEC.md`](docs/MVP_SPEC.md).

## Current status (honest)
| Capability | State |
|---|---|
| India VIIRS 375 m ingestion from NASA GIBS (30-day history, incremental) | Working |
| OSM industrial / energy / mining / landfill layer for India | Builder working; check the coverage flag (a partial layer is labelled as such) |
| Land cover (ESA WorldCover 10 m, cached) | Working |
| Persistence / baselines (distinct days per ~555 m cell) | Working |
| Rule-based classifier: 6 classes, confidence, plain-language reasons | Working (`rules-0.1.0`, thresholds **not tuned**) |
| Triage queue, persistent-source register, CSV/GeoJSON export, evidence panel, overlays | Working |
| Validation tooling | Built. 6 documentary sites only (exact class 3/6, industrial-vs-other 5/6): a smoke test, **not an accuracy figure** |
| PostGIS storage (Neon), spatial queries, shared triage acknowledgements | Working (`npm run db:setup && npm run db:load`); falls back to files if the DB is unavailable |
| Scheduled refresh | Workflow written, **never run** |
| ML model, SHAP, Sentinel-2 verification, bilingual reports | **Not built** (described in the deck as future/planned) |

Gap analysis against the official problem statement: [`docs/SIH_ALIGNMENT.md`](docs/SIH_ALIGNMENT.md).

## Tech stack (current)
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · shadcn/ui · Leaflet/react-leaflet · Recharts · TanStack Query · Prisma (PostgreSQL). Data: NASA GIBS active-fire MVT tiles (no key), NASA FIRMS area API (optional free MAP_KEY), NASA EONET.

## Quick start
```bash
npm install
npm run ingest -- --days 30     # ~15 min first time; fetches India VIIRS history from NASA GIBS
npm run build:industrial        # OSM facilities via Overpass (slow, resumable; needs network)
npm run build:snapshot          # classify → data/snapshot/latest.json.gz
npm run dev                     # http://localhost:3000
npm run test && npm run typecheck
```
```bash
# optional but recommended: PostGIS store (needs DATABASE_URL in .env, PostGIS enabled)
npm run db:setup && npm run db:load && npm run db:verify
```
Without a database the app serves everything from `data/` files (the API reports `store: "files"`). In production, write routes require `ADMIN_SECRET`.
Recording a demo? See [`DEMO.md`](DEMO.md).
Details, conventions and caveats: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Documentation
| Doc | Purpose |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Context and rules for AI-assisted coding |
| [`DEMO.md`](DEMO.md) | 3-person demo-video script |
| [`docs/SIH_ALIGNMENT.md`](docs/SIH_ALIGNMENT.md) | Official problem statement, prototype/deck gap analysis |
| [`docs/MVP_SPEC.md`](docs/MVP_SPEC.md) | Must-have MVP, class taxonomy, data model, demo flow |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Current and target architecture, API and data flow |
| [`docs/UI_UX_GUIDELINES.md`](docs/UI_UX_GUIDELINES.md) | UI review, target layout, accessibility |
| [`docs/PRESENTATION_STRATEGY.md`](docs/PRESENTATION_STRATEGY.md) | Evaluation strategy, deck fixes, Q&A prep |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Setup, conventions, data-integrity rules |
| `worklog.md` | History of how the prototype was first built |

## Data sources and licences
NASA FIRMS/GIBS/EONET (open, NASA data policy) · OpenStreetMap (ODbL, attribution required) · planned: ESA WorldCover (CC BY 4.0), EOG VIIRS Nightfire (free account, licensed product — confirm terms), Sentinel-2 via Copernicus.
