# UI/UX Guidelines

Principle: **AGNI-EYE is a triage tool, not an analytics dashboard.** The first screen must answer "what needs attention in India right now, and why?" — then let the user drill into evidence. Everything else is secondary.

## 1. Review of the current UI (`src/app/page.tsx`, `src/components/command/*`)

What works: dark command-centre tone, sticky top bar with UTC clock and source-status chips, working map with fly-to, responsive grid, skeleton loading.

Problems against the MVP goal:
- **Information hierarchy is inverted.** Six KPI cards (counts, FRP averages) sit above the map; none says anything about *what* a hotspot is.
- **Filters describe data plumbing** (six satellites, FRP slider, global presets) rather than the analyst's question (class, area, time).
- **Colour encodes brightness only**; there is no class encoding. Orange/red/yellow gradients are also weak for colour-blind users.
- **Alerts panel is a raw dump** of FRP-ranked rows, which reproduces the alert fatigue in the problem statement.
- **Text is very small** (`text-[9px]`/`[10px]`/`[11px]` throughout) and low-contrast (muted on dark) — unreadable on a projector.
- **Admin clutter in primary navigation**: FIRMS MAP_KEY dialog, auto-refresh interval, theme toggle.
- **Charts** (hourly, FRP buckets, day/night donut) are generic and do not support a decision.
- **Empty/error/stale handling** is thin; a fetch failure looks like "no fires".

## 2. Target layout

```
┌ Top bar: AGNI-EYE · India · time window · [LIVE | REPLAY | STALE] badge · last ingest · help ┐
├ Headline strip:  Raw hotspots 1,270  →  Classified 1,190  →  Needs attention 7   (click to filter) ┤
├ Left (collapsible) ─────────┬ Map (dominant) ───────────────┬ Right ───────────────────────┤
│ Class filter chips + counts │ Class-coloured hotspots        │ Triage queue (ranked)        │
│ Layers: Industrial sites,   │ Industrial site overlay        │   └ selecting an item opens  │
│  Persistent sources, Raw,   │ Legend (colour + shape)        │ Evidence panel: class,       │
│  Satellite basemap          │                               │  confidence, reasons,        │
│ Time window (24h/7d/30d)    │                               │  nearest facility, recurrence│
│ Area: India / state / view  │                               │  sparkline, FRP vs baseline, │
│                             │                               │  SWIR link, acknowledge      │
├ Tabs below map: Register (persistent sources) · Hotspots table · Validation · Analytics (collapsed) ┤
└ Footer: data sources, timestamps, classifier version ┘
```

### What to show prominently
Class-coloured map; the headline "raw → needs attention" strip; the triage queue; the evidence panel.

### What to simplify or move
- Satellite source toggles, FRP slider, day/night → an "Advanced filters" popover.
- FIRMS MAP_KEY, refresh interval, theme → a Settings/Admin menu (hidden behind the admin secret).
- Charts → "Analytics" tab, collapsed by default; keep at most two that support triage (activity by day; class mix).
- EONET → optional layer, not a primary tab.
- Global region presets → India (default), state selector, "use map view".

### What to remove from the demo path
Stat cards of average FRP/brightness; donut charts; anything that does not help decide "routine vs not routine".

## 3. User flow

1. Land on India, classified view, last 24 h, headline strip populated.
2. Scan triage queue (ranked) **or** click a class chip to filter the map.
3. Select an item → map flies to it, evidence panel opens with reasons and "why is this not routine".
4. Acknowledge/dismiss, or open the SWIR image link to verify.
5. Open Register to see repeat sources; export CSV/GeoJSON.

## 4. Visual system

- **Class palette** (distinct hues, and a distinct marker *shape* per class so colour is never the only channel):
  `industrial_anomaly` red ▲ · `industrial_persistent` amber ■ · `agricultural_burn` olive ◆ · `vegetation_fire` green ● · `other_static` violet ⬢ · `unclassified` grey ○. Validate contrast and colour-blind legibility before locking.
- Keep brightness/FRP as **size or ring**, not hue.
- Typography: body ≥ 14 px, labels ≥ 12 px, monospace for coordinates/timestamps; no `text-[9px]`.
- Contrast: WCAG AA (4.5:1 body, 3:1 large/UI). Provide a high-contrast/light theme for projectors.
- Use the existing shadcn/ui primitives and Tailwind tokens; define class colours as CSS variables in `globals.css`, not inline hex.

## 5. Components and states

| Area | Requirement |
|---|---|
| Loading | Skeletons sized to final content; map shows previous data dimmed while refetching |
| Empty | Explain *why* and offer a next action: "No hotspots in this window — widen to 7 d, or view REPLAY." |
| Error | Plain message, retry button, keep last good data with a STALE badge and timestamp |
| Partial failure | Surface `meta.tilesFailed > 0` as "some tiles missing — counts may be low" |
| Live vs replay | Persistent, colour-distinct badge in the top bar and on the map corner |
| Evidence panel | Reasons as a short list with icons; numeric evidence with units; every number links to its source |
| Forms (areas of interest) | Labelled inputs, inline validation, confirm on delete, toast on success/failure |
| Tables | Sortable, keyboard navigable, sticky header, row selection synced with map |
| Tooltips/help | One-line definition for each class in the legend; "How is this classified?" link opens the rules summary |

## 6. Accessibility

- All interactive controls keyboard reachable with visible focus; map markers reachable via the queue/table (Leaflet markers alone are not).
- `aria-label`s on icon buttons; `aria-live="polite"` for ingest/refresh status.
- Honour `prefers-reduced-motion` (disable the pulse animation and fly-to easing).
- Do not rely on colour alone (shape + label).
- Test at 200 % zoom and with a screen reader on the queue and evidence panel.

## 7. Responsiveness

- ≥ 1280 px: three-column layout above.
- 768–1279 px: map on top, queue/evidence as a right drawer, filters in a sheet.
- < 768 px: map first, bottom sheet for queue/evidence, filters behind a button; tables become cards. No horizontal page scroll (already guarded with `min-w-0`; keep it).

## 8. Content rules

- Say what it is: "Industrial anomaly (possible accident)", not "Severity: high".
- Never display a class without its confidence and reasons.
- Show data freshness and source on every panel that shows numbers.
- Use "unclassified" honestly; never guess to fill the map.
