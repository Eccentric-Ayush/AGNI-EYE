/**
 * Recurrence / baseline index. Counts DISTINCT DAYS of detection around a location (3×3 cell
 * neighbourhood ≈ 800 m), never raw rows — several satellites overpass the same site each day.
 * History is always PRIOR days only, so a hotspot never counts toward its own persistence.
 */

import { cellOf, neighbourhood } from "@/lib/geo/geo";
import { median } from "@/lib/geo/geo";
import type { CellHistory } from "@/lib/classify/types";
import { addDays } from "./dates";

export interface DayDetection {
  date: string; // YYYY-MM-DD (UTC)
  lat: number;
  lon: number;
  frp: number;
}

export class RecurrenceIndex {
  /** cellId → (date → max FRP that day) */
  private cells = new Map<string, Map<string, number>>();
  private observed: string[];

  /** `observedDates`: every date for which we hold data, even if it had zero detections nearby. */
  constructor(detections: DayDetection[], observedDates: Iterable<string>) {
    this.observed = [...new Set(observedDates)].sort();
    for (const d of detections) {
      const c = cellOf(d.lat, d.lon);
      const id = `${c.i}_${c.j}`;
      let m = this.cells.get(id);
      if (!m) this.cells.set(id, (m = new Map()));
      m.set(d.date, Math.max(m.get(d.date) ?? 0, d.frp));
    }
  }

  history(lat: number, lon: number, date: string, windowDays: number): CellHistory {
    const from = addDays(date, -windowDays);
    const perDay = new Map<string, number>();
    for (const id of neighbourhood(cellOf(lat, lon))) {
      const m = this.cells.get(id);
      if (!m) continue;
      for (const [d, frp] of m) {
        if (d < from || d >= date) continue;
        perDay.set(d, Math.max(perDay.get(d) ?? 0, frp));
      }
    }
    const dates = [...perDay.keys()].sort();
    const observedDays = this.observed.filter((d) => d >= from && d < date).length;
    const frps = [...perDay.values()];
    return {
      daysActive: dates.length,
      observedDays,
      windowDays,
      frpMedian: median(frps),
      frpSamples: frps.length,
      firstSeen: dates[0] ?? null,
      lastSeen: dates[dates.length - 1] ?? null,
    };
  }
}
