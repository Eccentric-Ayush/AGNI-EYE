# Validation set

`sites.json` is the **only** source of ground truth for accuracy claims. The classifier never reads it; `npm run evaluate` does.

## Add a verified site

```json
{
  "name": "Short human-readable name",
  "lat": 0.0,
  "lon": 0.0,
  "trueClass": "industrial_persistent",
  "date": "YYYY-MM-DD",
  "evidenceType": "imagery",            // or "documentary" (facility records only)
  "radiusM": 600,                        // optional; big plants need 1500-2500
  "evidenceUrl": "link to the imagery / record you used",
  "verifiedBy": "initials",
  "verifiedAt": "YYYY-MM-DD",
  "note": "what you saw (e.g. flare visible in Sentinel-2 SWIR)"
}
```

- `trueClass` ∈ `industrial_anomaly | industrial_persistent | agricultural_burn | vegetation_fire | other_static | unclassified`.
- `date` must fall inside the ingested raw window (see `data/raw/`); omit it to use the latest detection near the site.
- Aim for 20–30 sites covering every class, including hard cases (landfill, coal-seam fire, seasonal brick kiln, stubble fire next to an industrial belt).
- Verify each one yourselves. Never add an incident you have not checked; the numbers must stand up to an evaluator asking "how do you know?".

## What the current sites are
Six sites were added on 2026-09-30 from **public records only** (Wikipedia pages for operating plants/refineries and the Jharia coal-seam fires). They are marked `evidenceType: "documentary"` and are **not imagery-verified**. They cover only `industrial_persistent` and `other_static`; **no crop-burn, vegetation-fire or industrial-anomaly sites exist yet**, because those need a person to check imagery (e.g. Sentinel-2 SWIR burn scars) for a specific date and place. Please add those.

## Run

```bash
npm run ingest -- --days 30      # make sure raw data covers the dates you verified
npm run evaluate                 # writes data/validation/results.json, shown in the app's Validation tab
```

Do not tune thresholds in `src/lib/classify/config.ts` on these same sites and then quote the result as accuracy. If you tune, hold out a fresh subset for the number you report.
