/**
 * Classification domain types. Class ids are the single source of truth — see docs/MVP_SPEC.md §2.
 */

export const CLASS_IDS = [
  "industrial_anomaly",
  "industrial_persistent",
  "agricultural_burn",
  "vegetation_fire",
  "other_static",
  "unclassified",
] as const;

export type ClassId = (typeof CLASS_IDS)[number];
export type Confidence = "low" | "medium" | "high";

/** Land-cover categories the classifier understands (ESA WorldCover classes collapsed). */
export type LandCover = "forest" | "shrub_grass" | "cropland" | "built_up" | "wetland_water" | "bare" | "other";

export type SiteCategory =
  | "refinery"
  | "petrochemical"
  | "chemical"
  | "steel"
  | "cement"
  | "power_plant"
  | "flare"
  | "kiln"
  | "gas_lng"
  | "oil_depot"
  | "offshore_platform"
  | "industrial_area"
  | "mining"
  | "landfill";

export interface IndustrialSite {
  id: string; // e.g. "way/12345"
  name: string | null;
  category: SiteCategory;
  lat: number; // representative point / centroid
  lon: number;
  /** Outer ring as [lon, lat] pairs for area features; absent for point features. */
  ring?: Array<[number, number]>;
}

export interface SiteMatch {
  site: IndustrialSite;
  distanceM: number;
}

export interface HotspotInput {
  lat: number;
  lon: number;
  frp: number;
  brightness: number;
  brightT31: number | null;
  dayNight: "D" | "N";
  acqDate: string; // YYYY-MM-DD (UTC)
  acqTime: string; // "HH:MM" or "HHMM" (UTC)
  instrument: string;
  /** Satellite's own detection confidence (VIIRS: "low" | "nominal" | "high"). */
  detectionConfidence?: string | null;
}

/** Recurrence of thermal detections around a location, computed over PRIOR days only. */
export interface CellHistory {
  daysActive: number; // distinct prior days with >=1 detection within ~800 m
  observedDays: number; // prior days in the window for which we hold data at all
  windowDays: number;
  frpMedian: number; // median of per-day max FRP over active days (0 if none)
  frpSamples: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

export interface ClassifyContext {
  site: SiteMatch | null;
  history: CellHistory;
  landCover: LandCover | null;
}

export interface Reason {
  code: string;
  text: string;
}

export interface ClassificationResult {
  class: ClassId;
  subtype: string | null;
  confidence: Confidence;
  reasons: Reason[];
  classifierVersion: string;
}

export const CLASS_LABELS: Record<ClassId, string> = {
  industrial_anomaly: "Industrial anomaly",
  industrial_persistent: "Persistent industrial source",
  agricultural_burn: "Agricultural burn",
  vegetation_fire: "Vegetation / forest fire",
  other_static: "Other static source",
  unclassified: "Unclassified",
};
