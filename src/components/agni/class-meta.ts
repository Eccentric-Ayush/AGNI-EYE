import { CLASS_IDS, CLASS_LABELS, type ClassId, type Confidence } from "@/lib/classify/types";

export type Shape = "triangle" | "square" | "diamond" | "circle" | "hexagon" | "ring";

export interface ClassMeta {
  id: ClassId;
  label: string;
  color: string;
  shape: Shape;
  shapeName: string;
  definition: string;
}

/** Colour AND shape per class, so colour is never the only channel (docs/UI_UX_GUIDELINES.md §4). */
export const CLASS_META: Record<ClassId, ClassMeta> = {
  industrial_anomaly: {
    id: "industrial_anomaly",
    label: CLASS_LABELS.industrial_anomaly,
    color: "#ef4444",
    shape: "triangle",
    shapeName: "triangle",
    definition: "New or unusually strong heat at a mapped industrial site — a possible accident. Goes to the triage queue.",
  },
  industrial_persistent: {
    id: "industrial_persistent",
    label: CLASS_LABELS.industrial_persistent,
    color: "#fb923c",
    shape: "square",
    shapeName: "square",
    definition: "Routine, repeating industrial heat (flare, furnace, kiln, plant) at its normal level.",
  },
  agricultural_burn: {
    id: "agricultural_burn",
    label: CLASS_LABELS.agricultural_burn,
    color: "#facc15",
    shape: "diamond",
    shapeName: "diamond",
    definition: "Crop-residue burning: cropland, small fire, no industrial site nearby.",
  },
  vegetation_fire: {
    id: "vegetation_fire",
    label: CLASS_LABELS.vegetation_fire,
    color: "#4ade80",
    shape: "circle",
    shapeName: "circle",
    definition: "Forest, scrub or grass fire away from industry.",
  },
  other_static: {
    id: "other_static",
    label: CLASS_LABELS.other_static,
    color: "#c084fc",
    shape: "hexagon",
    shapeName: "hexagon",
    definition: "Persistent non-industrial heat: mine or coal-seam fire, landfill, volcano, or an unmapped persistent source.",
  },
  unclassified: {
    id: "unclassified",
    label: CLASS_LABELS.unclassified,
    color: "#94a3b8",
    shape: "ring",
    shapeName: "open ring",
    definition: "Not enough evidence to label. AGNI-EYE never forces a guess.",
  },
};

export const ORDERED_CLASSES: ClassId[] = [...CLASS_IDS];

/** Draw order: least important first so anomalies end up on top. */
export const DRAW_PRIORITY: Record<ClassId, number> = {
  unclassified: 0,
  vegetation_fire: 1,
  agricultural_burn: 2,
  other_static: 3,
  industrial_persistent: 4,
  industrial_anomaly: 5,
};

export const RAW_COLOR = "#e2e8f0";

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

export const SITE_CATEGORY_LABEL: Record<string, string> = {
  refinery: "Oil refinery",
  petrochemical: "Petrochemical complex",
  chemical: "Chemical plant",
  steel: "Steel plant",
  cement: "Cement plant",
  power_plant: "Power plant",
  flare: "Gas flare",
  kiln: "Kiln / brickworks",
  gas_lng: "Gas / LNG facility",
  oil_depot: "Oil depot / terminal",
  offshore_platform: "Offshore platform",
  industrial_area: "Industrial area",
  mining: "Mine / quarry",
  landfill: "Landfill",
};

export const LAND_COVER_LABEL: Record<string, string> = {
  forest: "Tree cover",
  shrub_grass: "Shrub / grassland",
  cropland: "Cropland",
  built_up: "Built-up",
  wetland_water: "Water / wetland",
  bare: "Bare / sparse",
  other: "Other",
};

export function formatSubtype(subtype: string | null): string | null {
  if (!subtype) return null;
  if (subtype === "unmapped_persistent") return "Unmapped persistent source";
  return SITE_CATEGORY_LABEL[subtype] ?? subtype.replace(/_/g, " ");
}

export function formatTime(acqDate: string, acqTime: string): string {
  const t = acqTime.padStart(4, "0");
  return `${acqDate} ${t.slice(0, 2)}:${t.slice(2)} UTC`;
}
