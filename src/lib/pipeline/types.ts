import type { ClassId, Confidence, LandCover, SiteCategory } from "@/lib/classify/types";
import type { ViirsSource } from "./raw-store";

export interface HotspotSite {
  id: string;
  name: string | null;
  category: SiteCategory;
  distanceM: number;
}

export interface HotspotHistory {
  daysActive: number;
  observedDays: number;
  frpMedian: number;
  frpSamples: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

/** A classified detection. Reasons are recomputed on demand from these stored inputs (classify is pure). */
export interface ClassifiedHotspot {
  id: string;
  source: ViirsSource;
  lat: number;
  lon: number;
  acqDate: string;
  acqTime: string; // HHMM UTC
  frp: number;
  brightness: number;
  brightT31: number | null;
  dayNight: "D" | "N";
  detectionConfidence: string | null;
  class: ClassId;
  subtype: string | null;
  confidence: Confidence;
  landCover: LandCover | null;
  site: HotspotSite | null;
  history: HotspotHistory;
}

export interface PersistentSource {
  id: string;
  lat: number;
  lon: number;
  class: ClassId;
  subtype: string | null;
  confidence: Confidence;
  siteName: string | null;
  siteCategory: SiteCategory | null;
  daysActive: number; // distinct days in the window (incl. latest)
  windowDays: number;
  firstSeen: string;
  lastSeen: string;
  frpMedian: number;
  frpP90: number;
  lastFrp: number;
  detections: number;
  landCover: LandCover | null;
}

export interface TriageItem {
  /** Stable across re-classification: "<acqDate>|<cellId>". Analyst decisions attach to this, not to `id`. */
  key: string;
  id: string; // hotspot id of the representative detection
  class: ClassId;
  confidence: Confidence;
  lat: number;
  lon: number;
  acqDate: string;
  acqTime: string;
  frp: number;
  detections: number; // detections merged into this item (same location, same day)
  siteName: string | null;
  siteCategory: SiteCategory | null;
  distanceM: number | null;
  headline: string;
  score: number;
  /** "review" = medium/high confidence (counts as needing attention); "watch" = low confidence, listed below. */
  priority: "review" | "watch";
  /** Present only when served from the database (shared across analysts). */
  status?: "open" | "ack" | "dismissed";
}

export interface DayCounts {
  raw: number;
  classified: number; // class !== unclassified
  byClass: Record<ClassId, number>;
  needsAttention: number; // deduplicated triage items in the "review" tier (medium/high confidence)
  watch: number; // deduplicated low-confidence triage items, shown as lower priority
}

export interface Snapshot {
  version: 1;
  generatedAt: string;
  classifierVersion: string;
  region: "india";
  latestDate: string;
  observedDates: string[]; // dates with data in the history window
  hotspotDates: string[]; // dates for which individual hotspots are stored
  counts: Record<string, DayCounts>; // by hotspot date
  layers: {
    industrialSites: { count: number; builtAt: string | null; source: string; coverage?: { chunksUsed: number; chunksTotal: number; complete: boolean } };
    landCover: string;
    historyWindowDays: number;
  };
  hotspots: ClassifiedHotspot[];
  sources: PersistentSource[];
  triage: TriageItem[];
}

/** Compact hotspot as served by GET /api/hotspots (no reasons; see /api/hotspots/[id]). */
export interface HotspotListItem {
  id: string;
  lat: number;
  lon: number;
  acqDate: string;
  acqTime: string;
  frp: number;
  class: ClassId;
  subtype: string | null;
  confidence: Confidence;
  source: ViirsSource;
  siteName: string | null;
  siteCategory: SiteCategory | null;
}
