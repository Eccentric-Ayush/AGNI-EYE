import { describe, expect, it } from "vitest";
import { buildSnapshot, hotspotId } from "./build";
import { dateRange } from "./dates";
import type { RawDay, RawRow, ViirsSource } from "./raw-store";
import { SiteIndex } from "@/lib/geo/site-index";
import type { IndustrialSite } from "@/lib/classify/types";

// Test-only fixtures. Nothing synthetic is ever written to data/ or shown in the app.
const LAT = 22.3;
const LON = 71.0;
const refinery: IndustrialSite = { id: "way/1", name: "Test Refinery", category: "refinery", lat: LAT, lon: LON };

const row = (lat: number, lon: number, frp = 10, time = "2030"): RawRow => [lat, lon, frp, 340, 300, time, "N", "nominal", "N"];

function day(date: string, source: ViirsSource, rows: RawRow[]): RawDay {
  return { date, source, fetchedAt: "x", tilesFetched: 1, tilesFailed: 0, complete: true, rows };
}

const base = {
  sitesMeta: { count: 1, builtAt: null, source: "test" },
  landCover: null,
  inIndia: () => true,
};

describe("buildSnapshot", () => {
  const dates = dateRange("2026-09-01", "2026-09-30");

  it("classifies a routine flare as persistent and a fresh spike as an anomaly", async () => {
    const raw: RawDay[] = [];
    for (const d of dates) {
      const rows = [row(LAT, LON, 10)];
      if (d === "2026-09-30") rows.push(row(LAT, LON, 80, "2100")); // spike on the last day
      raw.push(day(d, "viirs_snpp", rows));
    }
    const snap = await buildSnapshot({ ...base, rawDays: raw, sites: new SiteIndex([refinery]), hotspotDays: 1 });
    const last = snap.hotspots.filter((h) => h.acqDate === "2026-09-30");
    const routine = last.find((h) => h.frp === 10)!;
    const spike = last.find((h) => h.frp === 80)!;
    expect(routine.class).toBe("industrial_persistent");
    expect(spike.class).toBe("industrial_anomaly");
    expect(snap.triage).toHaveLength(1);
    expect(snap.triage[0].frp).toBe(80);
    expect(snap.counts["2026-09-30"].raw).toBe(2);
    expect(snap.counts["2026-09-30"].needsAttention).toBe(1);
    expect(snap.counts["2026-09-30"].watch).toBe(0);
    expect(snap.triage[0].key).toMatch(/^2026-09-30\|-?\d+_-?\d+$/);
    expect(snap.triage[0].priority).toBe("review"); // spike at a facility with a full month of history → high confidence
  });

  it("merges same-day multi-satellite anomaly detections into one triage item", async () => {
    const raw: RawDay[] = [];
    for (const d of dates.slice(0, 29)) raw.push(day(d, "viirs_snpp", [])); // history days exist but are quiet
    raw.push(day("2026-09-01", "viirs_snpp", [row(45, 45)])); // irrelevant far-away row keeps day 'observed'
    raw.push(day("2026-09-30", "viirs_snpp", [row(LAT, LON, 30, "0800")]));
    raw.push(day("2026-09-30", "viirs_noaa20", [row(LAT + 0.0005, LON, 35, "0850")]));
    raw.push(day("2026-09-30", "viirs_noaa21", [row(LAT, LON + 0.0005, 28, "0930")]));
    const snap = await buildSnapshot({ ...base, rawDays: raw, sites: new SiteIndex([refinery]), hotspotDays: 1 });
    expect(snap.triage).toHaveLength(1);
    expect(snap.triage[0].detections).toBe(3);
    // almost no history was observed here, so the label is low confidence → lower-priority tier, not "needs attention"
    expect(snap.triage[0].priority).toBe("watch");
    expect(snap.counts["2026-09-30"].needsAttention).toBe(0);
    expect(snap.counts["2026-09-30"].watch).toBe(1);
    expect(snap.triage[0].frp).toBe(35);
    // the item must point at the representative (strongest) detection, so queue and evidence agree
    const rep = snap.hotspots.find((h) => h.id === snap.triage[0].id)!;
    expect(snap.triage[0].lat).toBe(rep.lat);
    expect(snap.triage[0].lon).toBe(rep.lon);
  });

  it("treats zero-row days as not observed, not as 'no fires'", async () => {
    const raw = [
      day("2026-09-28", "viirs_snpp", [row(LAT, LON)]),
      day("2026-09-29", "viirs_snpp", [row(LAT, LON)]),
      day("2026-09-30", "viirs_snpp", []), // not yet published
    ];
    const snap = await buildSnapshot({ ...base, rawDays: raw, sites: new SiteIndex([refinery]) });
    expect(snap.latestDate).toBe("2026-09-29");
    expect(snap.observedDates).not.toContain("2026-09-30");
  });

  it("does not chain adjacent one-off fires into a persistent source (stubble season)", async () => {
    // A new field burns each day, each adjacent to the last, for 20 days: no location is persistent.
    const raw: RawDay[] = dates.slice(0, 20).map((d, i) => day(d, "viirs_snpp", [row(30 + i * 0.005, 75)]));
    const snap = await buildSnapshot({ ...base, rawDays: raw, sites: new SiteIndex([]) });
    expect(snap.sources).toHaveLength(0);
  });

  it("registers a genuinely recurring location once, with distinct-day counts", async () => {
    const raw: RawDay[] = [];
    for (const d of dates) {
      raw.push(day(d, "viirs_snpp", [row(LAT, LON, 10)]));
      raw.push(day(d, "viirs_noaa20", [row(LAT + 0.001, LON, 12)]));
    }
    const snap = await buildSnapshot({ ...base, rawDays: raw, sites: new SiteIndex([refinery]) });
    expect(snap.sources).toHaveLength(1);
    expect(snap.sources[0].daysActive).toBe(30);
    expect(snap.sources[0].siteCategory).toBe("refinery");
    expect(snap.sources[0].class).toBe("industrial_persistent");
  });

  it("clips to the supplied India predicate", async () => {
    const raw = [day("2026-09-30", "viirs_snpp", [row(LAT, LON), row(27.7, 85.3)])];
    const snap = await buildSnapshot({ ...base, inIndia: (lat) => lat < 25, rawDays: raw, sites: new SiteIndex([]) });
    expect(snap.hotspots).toHaveLength(1);
  });

  it("throws a helpful error when there is no data", async () => {
    await expect(buildSnapshot({ ...base, rawDays: [], sites: new SiteIndex([]) })).rejects.toThrow(/npm run ingest/);
  });
});

describe("hotspotId", () => {
  it("is stable and URL-safe", () => {
    const id = hotspotId({ source: "viirs_noaa20", acqDate: "2026-09-30", acqTime: "20:30", lat: 22.30123, lon: 71.00456 });
    expect(id).toBe("20260930_2030_noaa20_223012_710046");
    expect(encodeURIComponent(id)).toBe(id);
  });
});
