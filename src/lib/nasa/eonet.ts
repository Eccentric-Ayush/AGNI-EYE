/**
 * NASA EONET v3 client — live natural-event feed (wildfires etc).
 * https://eonet.gsfc.nasa.gov/api/v3 — real live data, no key required.
 */

import { fetchWithTimeout } from "./firms";

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

interface RawEonetGeometry {
  date?: string;
  type?: string;
  magnitudeValue?: number;
  magnitudeUnit?: string;
  coordinates?: number[] | number[][];
}

interface RawEonetEvent {
  id?: string;
  title?: string;
  description?: string | null;
  link?: string;
  closed?: string | null;
  categories?: Array<{ id?: string; title?: string }>;
  sources?: Array<{ id?: string; url?: string }>;
  geometry?: RawEonetGeometry[];
}

function lastPoint(g: RawEonetGeometry | undefined): { lon: number; lat: number } | null {
  if (!g || !Array.isArray(g.coordinates)) return null;
  let c = g.coordinates as unknown;
  if (!Array.isArray(c)) return null;
  // walk until [lon, lat]
  while (Array.isArray(c) && Array.isArray(c[0])) {
    c = c[c.length - 1];
  }
  if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
    return { lon: c[0], lat: c[1] };
  }
  return null;
}

export async function fetchEonetWildfires(opts?: {
  status?: "open" | "closed" | "all";
  days?: number;
  limit?: number;
  timeoutMs?: number;
}): Promise<{ ok: boolean; events: EonetEvent[]; error?: string }> {
  const status = opts?.status ?? "open";
  const days = opts?.days ?? 20;
  const limit = opts?.limit ?? 100;
  const url = `https://eonet.gsfc.nasa.gov/api/v3/events?status=${status}&category=wildfires&days=${days}&limit=${limit}`;

  // EONET occasionally hiccups; one quick retry smooths transient failures.
  let lastError = "network error";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(url, opts?.timeoutMs ?? 15000);
      if (!res.ok) {
        lastError = `EONET HTTP ${res.status}`;
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        return { ok: false, events: [], error: lastError };
      }
      const json = (await res.json()) as { events?: RawEonetEvent[] };
      const events: EonetEvent[] = [];
      for (const raw of json.events ?? []) {
        // use the last geometry (most recent position)
        const geoms = raw.geometry ?? [];
        const g = geoms[geoms.length - 1];
        const pt = lastPoint(g);
        if (!pt) continue;
        events.push({
          id: raw.id ?? "",
          title: raw.title ?? "Unnamed wildfire",
          description: raw.description ?? null,
          link: raw.link ?? "",
          closed: raw.closed ?? null,
          categories: (raw.categories ?? []).map((c) => ({ id: c.id ?? "wildfires", title: c.title ?? "Wildfires" })),
          sources: (raw.sources ?? []).map((s) => ({ id: s.id ?? "", url: s.url ?? "" })),
          date: g?.date ?? "",
          magnitudeValue: g?.magnitudeValue ?? null,
          magnitudeUnit: g?.magnitudeUnit ?? null,
          lon: pt.lon,
          lat: pt.lat,
        });
      }
      return { ok: true, events };
    } catch (e) {
      const err = e as Error & { cause?: { code?: string; message?: string } };
      lastError =
        err.name === "AbortError"
          ? "EONET unreachable (timeout)"
          : `${err.message}${err.cause?.code ? ` (${err.cause.code})` : ""}`;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
  }
  return { ok: false, events: [], error: lastError };
}
