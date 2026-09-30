"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ClassId, Confidence } from "@/lib/classify/types";
import type { ClassifiedHotspot, HotspotListItem, PersistentSource, TriageItem } from "@/lib/pipeline/types";

/** Error that remembers the HTTP status (503 = no snapshot built yet). */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

const REFRESH_MS = 5 * 60_000;

export interface HotspotsResponse {
  ok: boolean;
  generatedAt: string;
  ageHours: number;
  latestDate: string;
  dates: string[];
  availableDates: string[];
  classifierVersion: string;
  layers: {
    industrialSites: { count: number; builtAt: string | null; source: string };
    landCover: string;
    historyWindowDays: number;
  };
  totals: { raw: number; classified: number; byClass: Record<ClassId, number>; needsAttention: number; watch: number };
  truncated: boolean;
  features: HotspotListItem[];
}

export function useHotspots(days: number, minFrp: number) {
  return useQuery<HotspotsResponse, ApiError>({
    queryKey: ["agni", "hotspots", days, minFrp],
    queryFn: () => getJson(`/api/hotspots?days=${days}${minFrp > 0 ? `&minFrp=${minFrp}` : ""}`),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchInterval: REFRESH_MS,
    retry: (count, err) => err.status !== 503 && count < 1,
  });
}

export interface EvidenceResponse {
  ok: boolean;
  hotspot: ClassifiedHotspot;
  classLabel: string;
  reasons: Array<{ code: string; text: string }>;
  consistent: boolean;
  classifierVersion: { snapshot: string; current: string };
  links: { sentinelHub: string; firms: string; osm: string };
  store?: "postgis" | "files";
  /** Mapped facilities near the hotspot by true distance (PostGIS only). */
  nearbyFacilities?: Array<{ name: string | null; category: string; distanceM: number; kind: "area" | "point" }> | null;
}

export function useEvidence(id: string | null) {
  return useQuery<EvidenceResponse, ApiError>({
    queryKey: ["agni", "evidence", id],
    queryFn: () => getJson(`/api/hotspots/${encodeURIComponent(id!)}`),
    enabled: !!id,
    staleTime: 5 * 60_000,
    retry: (count, err) => err.status !== 404 && err.status !== 503 && count < 1,
  });
}

export interface TriageResponse {
  ok: boolean;
  generatedAt: string;
  ageHours: number;
  dates: string[];
  count: number;
  counts?: { review: number; watch: number };
  store?: "postgis" | "files";
  /** True when acknowledgements can be shared across analysts (database available). */
  sharedStatus?: boolean;
  items: TriageItem[];
}

export function useTriage(days: number) {
  return useQuery<TriageResponse, ApiError>({
    queryKey: ["agni", "triage", days],
    queryFn: () => getJson(`/api/triage?days=${days}`),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchInterval: REFRESH_MS,
    retry: (count, err) => err.status !== 503 && count < 1,
  });
}

export interface SitesResponse {
  ok: boolean;
  latestDate: string;
  generatedAt: string;
  count: number;
  sources: PersistentSource[];
}

export function useSites() {
  return useQuery<SitesResponse, ApiError>({
    queryKey: ["agni", "sites"],
    queryFn: () => getJson("/api/sites"),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    refetchInterval: REFRESH_MS,
    retry: (count, err) => err.status !== 503 && count < 1,
  });
}

export interface PipelineStatus {
  ok: boolean;
  snapshot: null | {
    generatedAt: string;
    ageHours: number;
    latestDate: string;
    observedDays: number;
    classifierVersion: string;
    hotspots: number;
    persistentSources: number;
    triageItems: number;
    freshness: "live" | "archived";
  };
  layers?: HotspotsResponse["layers"];
  industrialLayer: {
    available: boolean;
    count: number;
    builtAt: string | null;
    source: string;
    coverage?: { chunksUsed: number; chunksTotal: number; complete: boolean };
  };
}

export function usePipelineStatus() {
  return useQuery<PipelineStatus, ApiError>({
    queryKey: ["agni", "status"],
    queryFn: () => getJson("/api/pipeline/status"),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchInterval: REFRESH_MS,
    retry: 1,
  });
}

export interface ValidationResponse {
  ok: boolean;
  available: boolean;
  message?: string;
  generatedAt?: string;
  n?: number;
  perClass?: Record<string, { precision: number | null; recall: number | null; support: number }>;
  accuracy?: number | null;
  confusion?: { labels: string[]; matrix: number[][] };
  sites?: Array<{ name: string; trueClass: string; predictedClass: string; correct: boolean; note?: string }>;
  caveats?: string[];
}

export function useValidation() {
  return useQuery<ValidationResponse, ApiError>({
    queryKey: ["agni", "validation"],
    queryFn: () => getJson("/api/validation"),
    staleTime: 10 * 60_000,
    retry: false,
  });
}

export interface IndustrialFC {
  type: "FeatureCollection";
  attribution?: string;
  total: number;
  matched: number;
  truncated: boolean;
  features: Array<{
    type: "Feature";
    geometry: { type: "Point" | "Polygon"; coordinates: unknown };
    properties: { id: string; name: string | null; category: string; lat: number; lon: number };
  }>;
}

export async function fetchIndustrial(
  b: { west: number; south: number; east: number; north: number },
  signal?: AbortSignal
): Promise<IndustrialFC> {
  const q = new URLSearchParams({
    west: b.west.toFixed(4),
    south: b.south.toFixed(4),
    east: b.east.toFixed(4),
    north: b.north.toFixed(4),
  });
  const res = await fetch(`/api/layers/industrial?${q}`, { signal, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as IndustrialFC;
}

export type { ClassId, Confidence };
