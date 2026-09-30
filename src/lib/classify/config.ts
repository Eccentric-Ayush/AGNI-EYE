/**
 * Every classifier threshold lives here. These are STARTING values to be tuned on the
 * validation set (docs/MVP_SPEC.md §8) — they are not claims about accuracy.
 */

export const CLASSIFIER_VERSION = "rules-0.1.0";

export const CLASSIFIER_CONFIG = {
  /** Look-back window for recurrence, in days. */
  historyWindowDays: 30,
  /** Below this many observed prior days we cannot call a source "new" with confidence. */
  minHistoryDaysForConfidence: 14,

  /** A location is "persistent" if active on at least this many prior days AND this share of observed days. */
  persistentMinDays: 6,
  persistentMinShare: 0.3,

  /** Site match distance (m) from facility geometry. Point features get a tighter buffer than areas. */
  siteBufferAreaM: 500,
  siteBufferPointM: 400,

  /** FRP spike vs the location's own median (needs >= frpMinSamples prior active days). */
  anomalyFrpRatio: 3,
  frpMinSamples: 5,

  /** Crop-residue burning heuristics (used only when land cover says cropland). */
  agriMaxFrpMw: 40,

  /** Known static thermal sources that are not industrial (Global Volcanism Program). */
  staticSources: [
    { id: "barren-island-volcano", name: "Barren Island volcano (Andaman Sea)", lat: 12.278, lon: 93.858, radiusM: 3000, subtype: "volcano" },
  ] as Array<{ id: string; name: string; lat: number; lon: number; radiusM: number; subtype: string }>,
} as const;

/** Facility categories that are specific, well-attested industrial heat sources (higher confidence). */
export const SPECIFIC_INDUSTRIAL = new Set([
  "refinery",
  "petrochemical",
  "chemical",
  "steel",
  "cement",
  "power_plant",
  "flare",
  "gas_lng",
  "oil_depot",
  "offshore_platform",
]);

/** Non-industrial persistent heat (coal-seam/mine fires, landfill fires). */
export const NON_INDUSTRIAL_STATIC = new Set(["mining", "landfill"]);
