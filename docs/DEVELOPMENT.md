# Development Guidelines

## Setup
```bash
npm install                 # runs prisma generate via postinstall
cp .env.example .env        # create it; see variables below (.env* is git-ignored)
npm run db:push             # dev only — uses --accept-data-loss
npm run dev                 # http://localhost:3000
```

### Environment variables
| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | recommended | Postgres + PostGIS connection string (Neon pooled URL works). Without it the app serves from `data/` files. **In `.env`, quote the value and put nothing after it on the line; comments are dropped by dotenv but break naive parsers** |
| `AGNI_STORE` | no | Set to `files` to force the file fallback even when `DATABASE_URL` is set |
| `FIRMS_MAP_KEY` | no | Free FIRMS key; enables the FIRMS backend. Without it the app uses GIBS |
| `ADMIN_SECRET` | production | Value clients send in `x-admin-secret` for write/admin routes (`src/lib/auth.ts`). Unset → allowed in dev, **denied in production** |
| `CRON_SECRET` | target | `requireCron()` exists for a future `/api/cron/*`; no cron route yet |

## Commands
- `npm run dev | build | start | lint`
- `npx tsc --noEmit` (`npm run typecheck`) — run it while editing; `ignoreBuildErrors` is off, so `next build` also fails on type errors.
- `npm run test` (Vitest) covers classifier, recurrence and snapshot builder. Still untested: GIBS tile/MVT math, API routes, UI.
- Data pipeline: see the Commands list in `CLAUDE.md`. Raw tiles are git-ignored; `data/snapshot`, `data/industrial-india.json.gz` and `data/landcover-cache.json` are committed so the deployed app has data.

## Next.js 16 caveat
`AGENTS.md` warns that this Next.js version has breaking changes. Read the relevant guide under `node_modules/next/dist/docs/` (after `npm install`) before writing routing, caching, or config code. Do not rely on older Next.js habits.

## Conventions
- TypeScript strict-ish, `@/*` alias for `src/*`. Server-only code in `src/lib/**` and `src/app/api/**`; client components declare `"use client"`.
- API routes: `export const dynamic = "force-dynamic"`, validate and clamp every query param, return `{ ok, ... }` and a non-2xx status on failure. Never throw raw upstream errors to the client.
- Shared types live in `src/lib/types.ts`; keep backend payloads and these types in sync (the `FiresPayload` shape is currently duplicated in the fires route — dedupe when touching it).
- Data hooks live in `src/hooks/use-nasa.ts` (TanStack Query). New endpoints get a hook there.
- UI: shadcn/ui primitives from `src/components/ui/*` (stock — do not hand-edit), feature components in `src/components/command/*`. Follow `docs/UI_UX_GUIDELINES.md`.
- Spatial queries go through PostGIS SQL, not JS loops. Use `$queryRaw` with parameters (never string-concatenate SQL).
- Classification logic is **pure and deterministic**: `classify(features) → { class, confidence, reasons }`, versioned, unit-tested, thresholds only in `src/lib/classify/config.ts`.

## Data integrity rules (non-negotiable)
1. **No simulated or fabricated data**, anywhere, including seeds, tests shown in the UI, and demos.
2. A replay/offline dataset must be **real archived detections** and shown with a REPLAY badge; never blend it into live views.
3. Always show class + confidence + reasons together; never invent a label — use `unclassified`.
4. Do not present accuracy numbers that were not produced by the evaluation script on the held-out verified set.
5. Record provenance (source, satellite, acquisition time, classifier version) for every stored row.

## Git workflow
- Branch from `main`; current UI/UX work is on `fix/improve-UI-UX-Design`.
- Small commits, subject = what, body = why.
- Do not commit `.env*`, keys, or database files. `db/custom.db` is stale (SQLite) and should be removed from the repo once the DB decision is finalised.

## Definition of done (per change)
`npx tsc --noEmit` clean · `npm run lint` clean · tests for new logic · empty/loading/error states handled · docs updated if behaviour or architecture changed.

## Roadmap order
See `docs/MVP_SPEC.md` (M1–M12). Suggested sequence: DB + PostGIS + ingestion (M1) → industrial layer (M2) → recurrence/baseline (M3) → classifier + tests (M4) → overlays/evidence/triage (M5–M8) → KPI, validation, replay (M9–M11) → hardening (M12).

## Known technical debt
See `docs/SIH_ALIGNMENT.md` §7. Highlights: open write routes, per-instance memory cache on serverless, one-by-one alert inserts, `log: ['query']` in production, likely-unused dependencies, `ignoreBuildErrors`.

## Database workflow

```bash
npm run db:setup     # apply db/sql/*.sql (idempotent; needs PostGIS enabled on the database)
npm run db:load      # load data/snapshot + data/industrial-india.json.gz (add -- --sites to force the facility layer)
npm run db:verify    # 16 cross-checks, PostGIS vs the file snapshot; exit 1 on mismatch
```
- Add a new migration as `db/sql/002_<name>.sql`; never edit an applied file.
- Use `$queryRawUnsafe(sql, ...params)` with `$1…` placeholders; never build SQL from request input.
- To test the fallback: `AGNI_STORE=files npm run dev`, or set `DATABASE_URL` to a dead address.
- Vercel: set `DATABASE_URL` and `ADMIN_SECRET` in the project's environment variables; `prisma generate` already runs in `npm run build`.
