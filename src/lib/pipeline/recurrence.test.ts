import { describe, expect, it } from "vitest";
import { RecurrenceIndex, type DayDetection } from "./recurrence";
import { addDays, dateRange } from "./dates";

const LAT = 22.3;
const LON = 69.9;

describe("RecurrenceIndex", () => {
  const dates = dateRange("2026-09-01", "2026-09-30");

  it("counts distinct days, not rows (multi-satellite overpasses)", () => {
    const dets: DayDetection[] = [];
    for (const d of dates.slice(0, 10)) {
      // three satellites, same day, slight jitter
      dets.push({ date: d, lat: LAT, lon: LON, frp: 10 });
      dets.push({ date: d, lat: LAT + 0.001, lon: LON - 0.001, frp: 12 });
      dets.push({ date: d, lat: LAT - 0.001, lon: LON + 0.002, frp: 8 });
    }
    const idx = new RecurrenceIndex(dets, dates);
    const h = idx.history(LAT, LON, "2026-09-20", 30);
    expect(h.daysActive).toBe(10);
    expect(h.frpMedian).toBe(12); // per-day max
    expect(h.firstSeen).toBe("2026-09-01");
  });

  it("uses prior days only", () => {
    const idx = new RecurrenceIndex([{ date: "2026-09-10", lat: LAT, lon: LON, frp: 5 }], dates);
    expect(idx.history(LAT, LON, "2026-09-10", 30).daysActive).toBe(0);
    expect(idx.history(LAT, LON, "2026-09-11", 30).daysActive).toBe(1);
  });

  it("respects the window and observed-days denominator", () => {
    const idx = new RecurrenceIndex([{ date: "2026-08-01", lat: LAT, lon: LON, frp: 5 }], dates);
    const h = idx.history(LAT, LON, "2026-09-30", 30);
    expect(h.daysActive).toBe(0); // 2026-08-01 is outside the 30-day window
    expect(h.observedDays).toBe(29); // Sep 1..29
  });

  it("does not match sites farther than the neighbourhood", () => {
    const idx = new RecurrenceIndex([{ date: "2026-09-05", lat: LAT + 0.05, lon: LON, frp: 5 }], dates);
    expect(idx.history(LAT, LON, "2026-09-20", 30).daysActive).toBe(0);
  });

  it("addDays crosses month boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
