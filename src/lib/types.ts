/** Shared frontend types mirroring the backend API payloads. */

export type GibsSource =
  | "viirs_snpp"
  | "viirs_noaa20"
  | "viirs_noaa21"
  | "modis_terra"
  | "modis_aqua"
  | "modis_combined";

export interface FireProps {
  source: GibsSource;
  instrument: string;
  satellite: string;
  latitude: number;
  longitude: number;
  brightness: number;
  brightT31: number | null;
  frp: number;
  scan: number | null;
  track: number | null;
  acqDate: string;
  acqTime: string;
  dayNight: "D" | "N";
  confidence: number | null;
  version: string | null;
}

export interface FireFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: FireProps;
}

export interface FiresStats {
  total: number;
  bySource: Record<string, number>;
  byDayNight: { D: number; N: number };
  maxFrp: number;
  avgFrp: number;
  maxBrightness: number;
  avgBrightness: number;
  highFrpCount: number;
  byHour: Array<{ hour: string; count: number }>;
  frpBuckets: Array<{ bucket: string; count: number }>;
  byDate: Array<{ date: string; count: number }>;
}

export interface FiresPayload {
  ok: boolean;
  backend: "gibs" | "firms";
  fellback: boolean;
  notice: string | null;
  cached: boolean;
  cacheAge: number;
  generatedAt: string;
  params: {
    sources: GibsSource[];
    bbox: { west: number; south: number; east: number; north: number };
    date: string;
    days: number;
    backend: string;
  };
  stats: FiresStats;
  features: FireFeature[];
  meta: {
    tilesFetched: number;
    tilesFailed: number;
    zoom: number;
    truncated: boolean;
    fetchMs: number;
  };
}

export interface EonetEvent {
  id: string;
  title: string;
  description: string | null;
  link: string;
  closed: string | null;
  categories: Array<{ id: string; title: string }>;
  sources: Array<{ id: string; url: string }>;
  date: string;
  magnitudeValue: number | null;
  magnitudeUnit: string | null;
  lon: number;
  lat: number;
}

export interface SourceStatus {
  name: string;
  realtime: boolean;
  keyRequired: boolean;
  ok: boolean;
  detail: string;
  latencyMs: number;
  configured?: boolean;
  reachable?: boolean;
}

export interface SourcesStatusPayload {
  ok: boolean;
  checkedAt: string;
  sources: {
    gibsHotspots: SourceStatus;
    eonet: SourceStatus;
    firmsApi: SourceStatus;
    gibsImagery: SourceStatus;
  };
  cached?: boolean;
}

export interface WatchRegion {
  id: string;
  name: string;
  west: number;
  south: number;
  east: number;
  north: number;
  sources: string;
  createdAt: string;
}

export interface FireAlert {
  id: string;
  regionName: string;
  lat: number;
  lon: number;
  brightness: number;
  frp: number;
  satellite: string;
  acquiredAt: string;
  dayNight: string;
  severity: string;
  acknowledged: boolean;
  createdAt: string;
}

export interface SettingsPayload {
  ok: boolean;
  firmsMapKey: {
    configured: boolean;
    masked: string | null;
  };
  registerUrl: string;
}

export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export const REGION_PRESETS: Array<{ name: string; bbox: Bbox }> = [
  { name: "Global", bbox: { west: -180, south: -85, east: 180, north: 85 } },
  { name: "South & Southeast Asia", bbox: { west: 60, south: -12, east: 150, north: 30 } },
  { name: "India Subcontinent", bbox: { west: 60, south: 5, east: 98, north: 38 } },
  { name: "East Asia", bbox: { west: 95, south: 15, east: 146, north: 54 } },
  { name: "Australia & Oceania", bbox: { west: 110, south: -50, east: 180, north: -8 } },
  { name: "Africa", bbox: { west: -20, south: -37, east: 52, north: 38 } },
  { name: "Europe & Mediterranean", bbox: { west: -12, south: 28, east: 45, north: 58 } },
  { name: "Middle East", bbox: { west: 34, south: 10, east: 64, north: 42 } },
  { name: "North America", bbox: { west: -170, south: 7, east: -52, north: 72 } },
  { name: "Central & South America", bbox: { west: -82, south: -56, east: -34, north: 13 } },
];

export const SOURCE_LABELS: Record<GibsSource, string> = {
  viirs_snpp: "VIIRS S-NPP",
  viirs_noaa20: "VIIRS NOAA-20",
  viirs_noaa21: "VIIRS NOAA-21",
  modis_terra: "MODIS Terra",
  modis_aqua: "MODIS Aqua",
  modis_combined: "MODIS Cmb",
};

export const ALL_SOURCES: GibsSource[] = [
  "viirs_snpp",
  "viirs_noaa20",
  "viirs_noaa21",
  "modis_terra",
  "modis_aqua",
  "modis_combined",
];

export function severityColor(sev: string): string {
  switch (sev) {
    case "extreme":
      return "text-red-500";
    case "high":
      return "text-orange-500";
    case "moderate":
      return "text-amber-400";
    default:
      return "text-yellow-300";
  }
}

/** Brightness color ramp for markers (Kelvin). */
export function brightnessColor(brightness: number): string {
  if (brightness >= 360) return "#dc2626"; // red
  if (brightness >= 335) return "#ea580c"; // dark orange
  if (brightness >= 310) return "#f97316"; // orange
  return "#facc15"; // yellow
}

export function markerRadius(frp: number): number {
  return Math.min(11, 2.6 + Math.log10(Math.max(1, frp)) * 2.2);
}
