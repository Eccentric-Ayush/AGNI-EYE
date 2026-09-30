# SIH Presentation & Demo Strategy

Rule: **every claim in the deck and every second of the demo must map to something implemented, or be labelled "planned".** Evaluators compare the deck to the prototype; the current gap (see `SIH_ALIGNMENT.md` §4) is the biggest risk.

## 1. What to emphasise

1. **The problem is classification, not detection.** FIRMS already detects. Open with "the dots are not the product; the label and the evidence are."
2. **Noise reduction as the headline metric:** raw hotspots → classified → needs attention. This is measurable from the app.
3. **Explainability you can audit:** every label has reason codes (distance to a named facility, days active, FRP vs the site's own baseline).
4. **Persistent-source register + GIS export** (Deliverable 2): stored, queryable, downloadable as GeoJSON/CSV.
5. **Honest validation** on externally verified sites, with limits stated. Analysts at NTRO will distrust a 99 % claim on weak labels far more than a modest, reproducible number.
6. **Open, free data; reproducible.** True as long as you disclose the free MAP_KEY and any free-account/licensing requirement (EOG Nightfire).

## 2. Problem → solution → impact flow

| Step | On slide | In the demo |
|---|---|---|
| Problem | One India map of raw hotspots; "N dots, all look the same"; alert-fatigue quote from the problem statement | Raw toggle |
| Why current tools fail | FIRMS lacks site context and history | — |
| Solution | Pipeline diagram: ingest → recurrence/baseline → facility match → classify with reasons → triage | Classified toggle, headline strip |
| Proof | One routine flare, one anomaly, one stubble cluster, one forest fire, each with evidence | Click through the four |
| Deliverable 2 | GIS layers and export | Layer toggles + GeoJSON download |
| Impact | Triage time and analyst load, stated as measured or estimated (say which) | Headline strip |
| Trust | Validation card, limits, roadmap | Validation tab |

## 3. Claims to fix in the current deck

- Stack slide: describe what is running (Next.js/TS + PostGIS + rule-based classifier). If Python/ML exists, show it as offline evaluation.
- Remove or qualify: SHAP, DBSCAN, Random Forest, Sentinel-2 "verified ~200 sites", "bilingual filable report", "validation in progress" — unless built or clearly under "Roadmap".
- "No-login data": say "free public data (free FIRMS MAP_KEY)".
- "Days to minutes": replace with a defensible statement, e.g. "one ranked queue instead of a raw dump"; quote latency of the feeds honestly (hours, not seconds).
- Replace the dashboard screenshot with the classified triage view.
- Add a slide: "Limits & what we don't claim" (MODIS resolution, cloud gaps, no ground-truth labels, thresholds tuned on a small set).

## 4. Evidence to prepare (bring numbers, not adjectives)

- Screenshot/GIF of the four-class walk-through.
- Suppression figure for a specific date (e.g. "on <date>: X hotspots in India → Y need attention"), reproducible via a script.
- Validation table: 20–30 verified sites, per-class precision/recall, plus the failure cases and why.
- Register export sample (GeoJSON opened in QGIS is a strong visual for a "GIS-based solution").
- Latency/throughput: ingest time for India, query time for a bbox.

## 5. Likely evaluator questions — prepare answers

| Question | Answer direction |
|---|---|
| How is this different from FIRMS? | FIRMS = detection; we add site context, persistence, baseline, classification and reasons |
| How do you know it's accurate with no labels? | Independent verified set, reported honestly; rules are inspectable; unclassified is allowed |
| Why rules and not deep learning? | No ground truth; explainability for analysts; ML planned as second stage on the verified set |
| What are the false negatives? | Small/short flares, cloud cover, sub-pixel events, industrial sites missing from OSM |
| Is it real-time? | Near-real-time, bounded by satellite overpass and FIRMS/GIBS latency (hours) |
| Scalability? | Scheduled ingest → PostGIS with spatial index; India ≈ thousands of hotspots/day |
| What about sensitive infrastructure? | Uses public OSM only; access control on write/admin; roles are roadmap |
| What if NASA is down? | Stored data with STALE badge; labelled REPLAY of real archived detections |
| What did you build vs plan? | Show M-item checklist from `MVP_SPEC.md` |

## 6. Demo risks and mitigations

- **Live data may be empty or slow** → REPLAY mode with real archived detections, clearly labelled; pre-warm the cache before presenting.
- **Network down at the venue** → local build with seeded DB; screen recording as last resort (say it is a recording).
- **Overlong demo** → follow the 3-minute script in `MVP_SPEC.md` §6; rehearse with a timer.
- **Unverified example events** → only present events whose date, location and class you have verified yourselves.
