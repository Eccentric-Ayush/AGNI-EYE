"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Bbox,
  FireAlert,
  FiresPayload,
  EonetEvent,
  SettingsPayload,
  SourcesStatusPayload,
  WatchRegion,
} from "@/lib/types";

async function jsonFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface FiresQuery {
  sources: string; // "all" or comma list
  bbox: Bbox;
  date: string;
  days: number;
  dayNight: string; // "all" | "D" | "N"
  minFrp: number;
}

export function firesUrl(q: FiresQuery): string {
  const sp = new URLSearchParams({
    sources: q.sources,
    west: q.bbox.west.toFixed(3),
    south: q.bbox.south.toFixed(3),
    east: q.bbox.east.toFixed(3),
    north: q.bbox.north.toFixed(3),
    date: q.date,
    days: String(q.days),
    dayNight: q.dayNight,
    minFrp: String(q.minFrp),
  });
  return `/api/fires?${sp.toString()}`;
}

export function useFires(q: FiresQuery, refetchMs: number, enabled: boolean) {
  return useQuery<FiresPayload>({
    queryKey: ["fires", q],
    queryFn: () => jsonFetch(firesUrl(q)),
    refetchInterval: enabled && refetchMs > 0 ? refetchMs : false,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useEonet(days = 30, limit = 80) {
  return useQuery<{ ok: boolean; events: EonetEvent[] }>({
    queryKey: ["eonet", days, limit],
    queryFn: () => jsonFetch(`/api/eonet/events?days=${days}&limit=${limit}`),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });
}

export function useSourcesStatus() {
  return useQuery<SourcesStatusPayload>({
    queryKey: ["sources-status"],
    queryFn: () => jsonFetch("/api/sources/status"),
    staleTime: 55_000,
    refetchInterval: 120_000,
    retry: 1,
  });
}

export function useWatchlist() {
  return useQuery<{ ok: boolean; regions: WatchRegion[] }>({
    queryKey: ["watchlist"],
    queryFn: () => jsonFetch("/api/watchlist"),
  });
}

export function useAddWatchRegion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string } & Bbox) => {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add region");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });
}

export function useDeleteWatchRegion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete region");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["watchlist"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

export function useAlerts(limit = 100) {
  return useQuery<{ ok: boolean; alerts: FireAlert[]; unreadCount: number }>({
    queryKey: ["alerts", limit],
    queryFn: () => jsonFetch(`/api/alerts?limit=${limit}`),
    refetchInterval: 120_000,
  });
}

export function useScanAlerts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/alerts/scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      return data as { ok: boolean; scanned: number; newAlerts: number; fetchMs: number; message?: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

export function useClearAlerts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/alerts", { method: "DELETE" });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

export function useSettings() {
  return useQuery<SettingsPayload>({
    queryKey: ["settings"],
    queryFn: () => jsonFetch("/api/settings"),
  });
}

export function useSaveMapKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mapKey, action }: { mapKey?: string; action?: "clear" }) => {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action ? { action } : { mapKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save key");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["sources-status"] });
      qc.invalidateQueries({ queryKey: ["mapkey-validate"] });
    },
  });
}

export function useValidateMapKey() {
  return useMutation({
    mutationFn: async (mapKey: string) => {
      const res = await fetch("/api/firms/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Validation request failed");
      return data as {
        ok: boolean;
        valid: boolean | null;
        reachable: boolean | null;
        error?: string;
        hint?: string;
        message?: string;
      };
    },
  });
}
