/** Shared helpers for the read-side API routes (server only). */
import { NextResponse } from "next/server";
import { CLASS_IDS, type ClassId } from "@/lib/classify/types";
import type { Bbox } from "@/lib/geo/geo";
import { readSnapshot } from "./snapshot-store";
import type { Snapshot } from "./types";

export function noSnapshotResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "No classified snapshot available yet. Run `npm run ingest` then `npm run build:snapshot` (or the scheduled job).",
    },
    { status: 503 }
  );
}

export function loadOr503(): Snapshot | null {
  return readSnapshot();
}

export function parseClasses(v: string | null): Set<ClassId> | null {
  if (!v) return null;
  const s = new Set(v.split(",").map((x) => x.trim()).filter((x): x is ClassId => (CLASS_IDS as readonly string[]).includes(x)));
  return s.size ? s : null;
}

export function parseBbox(sp: URLSearchParams): Bbox | null {
  const [w, s, e, n] = ["west", "south", "east", "north"].map((k) => parseFloat(sp.get(k) ?? ""));
  return [w, s, e, n].every(Number.isFinite) ? { west: w, south: s, east: e, north: n } : null;
}

/** Dates selected by `days` (most recent N stored hotspot dates, optionally ending at `date`). */
export function selectDates(snap: Snapshot, sp: URLSearchParams): string[] {
  const all = snap.hotspotDates;
  const end = sp.get("date");
  const upto = end && all.includes(end) ? all.filter((d) => d <= end) : all;
  const days = Math.max(1, Math.min(all.length, parseInt(sp.get("days") ?? "1", 10) || 1));
  return upto.slice(-days);
}

export function snapshotAgeHours(snap: Snapshot): number {
  return Math.round(((Date.now() - Date.parse(snap.generatedAt)) / 3_600_000) * 10) / 10;
}

export function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
