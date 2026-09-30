/**
 * Rule-based, evidence-scoring classifier. Pure and deterministic: same inputs → same output.
 * Never forces a label: insufficient evidence → "unclassified".
 * Decision outline: docs/MVP_SPEC.md §8.
 */

import { haversineMeters } from "@/lib/geo/geo";
import { CLASSIFIER_CONFIG as C, CLASSIFIER_VERSION, NON_INDUSTRIAL_STATIC, SPECIFIC_INDUSTRIAL } from "./config";
import type { ClassId, ClassificationResult, ClassifyContext, Confidence, HotspotInput, Reason, SiteCategory } from "./types";

export { CLASSIFIER_VERSION } from "./config";
export * from "./types";

const CATEGORY_LABEL: Record<SiteCategory, string> = {
  refinery: "oil refinery",
  petrochemical: "petrochemical complex",
  chemical: "chemical plant",
  steel: "steel plant",
  cement: "cement plant",
  power_plant: "power plant",
  flare: "gas flare",
  kiln: "kiln / brickworks",
  gas_lng: "gas / LNG facility",
  oil_depot: "oil depot / terminal",
  offshore_platform: "offshore platform",
  industrial_area: "industrial area",
  mining: "mine / quarry",
  landfill: "landfill",
};

/** Local mean solar hour (0–24) from UTC acquisition time and longitude. */
export function solarHour(acqTime: string, lon: number): number {
  const digits = acqTime.replace(":", "").padStart(4, "0");
  const utc = Number(digits.slice(0, 2)) + Number(digits.slice(2, 4)) / 60;
  return (((utc + lon / 15) % 24) + 24) % 24;
}

export function monthOf(acqDate: string): number {
  return Number(acqDate.slice(5, 7));
}

function result(
  cls: ClassId,
  confidence: Confidence,
  reasons: Reason[],
  subtype: string | null = null
): ClassificationResult {
  return { class: cls, subtype, confidence, reasons, classifierVersion: CLASSIFIER_VERSION };
}

function fmtDist(m: number): string {
  return m < 1 ? "inside the facility boundary" : `${Math.round(m)} m from the facility`;
}

export function classify(h: HotspotInput, ctx: ClassifyContext): ClassificationResult {
  const res = classifyCore(h, ctx);
  // The satellite itself flags low-confidence pixels (sun glint, hot ground, etc.): say so and never
  // let such a detection drive a high-confidence label.
  if (h.detectionConfidence === "low") {
    res.reasons.push({ code: "LOW_DETECTION_CONFIDENCE", text: "The satellite flagged this detection as low confidence (possible false alarm)." });
    res.confidence = "low";
  }
  return res;
}

function classifyCore(h: HotspotInput, ctx: ClassifyContext): ClassificationResult {
  const reasons: Reason[] = [];
  const { history, site } = ctx;

  const enoughHistory = history.observedDays >= C.minHistoryDaysForConfidence;
  const persistent =
    history.daysActive >= C.persistentMinDays &&
    history.observedDays > 0 &&
    history.daysActive / history.observedDays >= C.persistentMinShare;
  const spike =
    history.frpSamples >= C.frpMinSamples && history.frpMedian > 0 && h.frp >= C.anomalyFrpRatio * history.frpMedian;

  if (persistent) {
    reasons.push({
      code: "RECURRENCE",
      text: `Detected on ${history.daysActive} of the last ${history.observedDays} observed days within ~800 m.`,
    });
  } else if (history.observedDays > 0) {
    reasons.push({
      code: "LOW_RECURRENCE",
      text: `Detected on only ${history.daysActive} of the last ${history.observedDays} observed days at this location.`,
    });
  }
  if (!enoughHistory) {
    reasons.push({
      code: "HISTORY_SHORT",
      text: `Only ${history.observedDays} days of history available (< ${C.minHistoryDaysForConfidence}); persistence is uncertain.`,
    });
  }
  if (spike) {
    reasons.push({
      code: "FRP_SPIKE",
      text: `FRP ${h.frp.toFixed(1)} MW is ${(h.frp / history.frpMedian).toFixed(1)}× this location's median (${history.frpMedian.toFixed(1)} MW).`,
    });
  }

  // 1. Known static non-industrial sources (volcano).
  for (const s of C.staticSources) {
    if (haversineMeters(h.lat, h.lon, s.lat, s.lon) <= s.radiusM) {
      return result(
        "other_static",
        "high",
        [{ code: "KNOWN_STATIC", text: `Within ${s.radiusM / 1000} km of ${s.name}.` }, ...reasons],
        s.subtype
      );
    }
  }

  // 2. Matched to a mapped facility.
  if (site) {
    const name = site.site.name ? `“${site.site.name}” (${CATEGORY_LABEL[site.site.category]})` : CATEGORY_LABEL[site.site.category];
    reasons.unshift({ code: "NEAR_FACILITY", text: `Hotspot is ${fmtDist(site.distanceM)}: ${name}.` });

    if (NON_INDUSTRIAL_STATIC.has(site.site.category)) {
      return result("other_static", persistent ? "high" : "medium", reasons, site.site.category);
    }

    const specific = SPECIFIC_INDUSTRIAL.has(site.site.category);
    const siteConf: Confidence = specific ? "high" : "medium";

    if (persistent && !spike) {
      const conf: Confidence = enoughHistory ? siteConf : "medium";
      return result("industrial_persistent", conf, reasons, site.site.category);
    }
    if (spike) {
      return result("industrial_anomaly", enoughHistory ? siteConf : "medium", reasons, site.site.category);
    }
    // At a facility but not a routine heat source: new / rare activity → possible accident.
    reasons.push({ code: "NOT_ROUTINE", text: "Not a routine heat source at this facility — escalate for review." });
    return result("industrial_anomaly", enoughHistory ? (specific ? "medium" : "low") : "low", reasons, site.site.category);
  }

  // 3. Persistent but no mapped facility → register it as an unmapped persistent source.
  if (persistent) {
    reasons.push({ code: "NO_MAPPED_FACILITY", text: "No mapped industrial facility nearby; persistent heat source not in the industrial layer." });
    return result("other_static", enoughHistory ? "medium" : "low", reasons, "unmapped_persistent");
  }

  // 4. Land-cover driven natural/agricultural classes.
  const lc = ctx.landCover;
  if (lc === "cropland") {
    reasons.push({ code: "CROPLAND", text: "Land cover at the hotspot is cropland; no industrial facility nearby." });
    const hr = solarHour(h.acqTime, h.lon);
    const afternoon = hr >= 11 && hr <= 17;
    if (afternoon) reasons.push({ code: "AFTERNOON_PASS", text: `Acquired at ~${hr.toFixed(0)}:00 local solar time, typical of crop-residue burning.` });
    if (h.frp > C.agriMaxFrpMw) {
      reasons.push({ code: "HIGH_FRP_FOR_CROP", text: `FRP ${h.frp.toFixed(1)} MW is high for a crop fire; review.` });
      return result("agricultural_burn", "low", reasons);
    }
    return result("agricultural_burn", afternoon ? "high" : "medium", reasons);
  }
  if (lc === "forest" || lc === "shrub_grass") {
    reasons.push({ code: "NATURAL_COVER", text: `Land cover at the hotspot is ${lc === "forest" ? "tree cover" : "shrub/grassland"}; no industrial facility nearby.` });
    return result("vegetation_fire", lc === "forest" ? "high" : "medium", reasons);
  }
  if (lc === "built_up") {
    reasons.push({ code: "BUILT_UP", text: "Built-up area with no mapped industrial facility (possible unmapped industry, waste burning or structure fire)." });
    return result("unclassified", "low", reasons, "built_up");
  }

  reasons.push({
    code: lc ? "COVER_NOT_INFORMATIVE" : "NO_LANDCOVER",
    text: lc ? `Land cover (${lc}) does not discriminate the fire type.` : "Land cover unavailable; evidence is insufficient to label.",
  });
  return result("unclassified", "low", reasons);
}

/** Does this result belong in the triage queue? */
export function needsAttention(r: ClassificationResult): boolean {
  return r.class === "industrial_anomaly";
}
