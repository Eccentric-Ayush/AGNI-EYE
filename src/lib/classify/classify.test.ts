import { describe, expect, it } from "vitest";
import { classify, solarHour } from "./index";
import type { CellHistory, ClassifyContext, HotspotInput, IndustrialSite } from "./types";
import { SiteIndex } from "@/lib/geo/site-index";

const hot = (over: Partial<HotspotInput> = {}): HotspotInput => ({
  lat: 22.3,
  lon: 69.9,
  frp: 10,
  brightness: 340,
  brightT31: 300,
  dayNight: "N",
  acqDate: "2026-09-30",
  acqTime: "2030",
  instrument: "VIIRS",
  ...over,
});

const hist = (over: Partial<CellHistory> = {}): CellHistory => ({
  daysActive: 0,
  observedDays: 30,
  windowDays: 30,
  frpMedian: 0,
  frpSamples: 0,
  firstSeen: null,
  lastSeen: null,
  ...over,
});

const refinery: IndustrialSite = { id: "way/1", name: "Test Refinery", category: "refinery", lat: 22.3, lon: 69.9 };
const ctx = (over: Partial<ClassifyContext> = {}): ClassifyContext => ({ site: null, history: hist(), landCover: null, ...over });
const near = (site: IndustrialSite, d = 100) => ({ site, distanceM: d });

describe("classify", () => {
  it("routine persistent flare at a refinery → industrial_persistent (high)", () => {
    const r = classify(hot(), ctx({ site: near(refinery), history: hist({ daysActive: 26, frpMedian: 10, frpSamples: 26 }) }));
    expect(r.class).toBe("industrial_persistent");
    expect(r.confidence).toBe("high");
    expect(r.reasons.map((x) => x.code)).toContain("NEAR_FACILITY");
    expect(r.reasons.map((x) => x.code)).toContain("RECURRENCE");
  });

  it("FRP spike at a persistent facility → industrial_anomaly", () => {
    const r = classify(hot({ frp: 90 }), ctx({ site: near(refinery), history: hist({ daysActive: 26, frpMedian: 10, frpSamples: 26 }) }));
    expect(r.class).toBe("industrial_anomaly");
    expect(r.reasons.map((x) => x.code)).toContain("FRP_SPIKE");
  });

  it("new hotspot at a facility with solid history → industrial_anomaly", () => {
    const r = classify(hot(), ctx({ site: near(refinery), history: hist({ daysActive: 0 }) }));
    expect(r.class).toBe("industrial_anomaly");
    expect(r.reasons.map((x) => x.code)).toContain("NOT_ROUTINE");
  });

  it("short history lowers confidence and is disclosed", () => {
    const r = classify(hot(), ctx({ site: near(refinery), history: hist({ daysActive: 0, observedDays: 3 }) }));
    expect(r.class).toBe("industrial_anomaly");
    expect(r.confidence).toBe("low");
    expect(r.reasons.map((x) => x.code)).toContain("HISTORY_SHORT");
  });

  it("mine/quarry and landfill are other_static, never industrial fires", () => {
    const mine: IndustrialSite = { id: "way/2", name: null, category: "mining", lat: 23.7, lon: 86.4 };
    expect(classify(hot(), ctx({ site: near(mine) })).class).toBe("other_static");
    const lf: IndustrialSite = { id: "way/3", name: null, category: "landfill", lat: 28.7, lon: 77.3 };
    expect(classify(hot(), ctx({ site: near(lf) })).subtype).toBe("landfill");
  });

  it("volcano is a known static source", () => {
    const r = classify(hot({ lat: 12.28, lon: 93.86 }), ctx());
    expect(r.class).toBe("other_static");
    expect(r.subtype).toBe("volcano");
  });

  it("persistent but unmapped → other_static/unmapped_persistent", () => {
    const r = classify(hot(), ctx({ history: hist({ daysActive: 15 }) }));
    expect(r.class).toBe("other_static");
    expect(r.subtype).toBe("unmapped_persistent");
  });

  it("cropland afternoon pass → agricultural_burn (high)", () => {
    const r = classify(hot({ acqTime: "0800", lon: 75 }), ctx({ landCover: "cropland" })); // 08:00 UTC + 5h = 13:00 solar
    expect(r.class).toBe("agricultural_burn");
    expect(r.confidence).toBe("high");
  });

  it("forest → vegetation_fire", () => {
    expect(classify(hot(), ctx({ landCover: "forest" })).class).toBe("vegetation_fire");
  });

  it("never forces a label without evidence", () => {
    const r = classify(hot(), ctx());
    expect(r.class).toBe("unclassified");
    expect(r.confidence).toBe("low");
  });

  it("a low-confidence satellite detection is disclosed and never yields a high-confidence label", () => {
    const routine = ctx({ site: near(refinery), history: hist({ daysActive: 26, frpMedian: 10, frpSamples: 26 }) });
    expect(classify(hot(), routine).confidence).toBe("high");
    const low = classify(hot({ detectionConfidence: "low" }), routine);
    expect(low.class).toBe("industrial_persistent");
    expect(low.confidence).toBe("low");
    expect(low.reasons.map((x) => x.code)).toContain("LOW_DETECTION_CONFIDENCE");
  });

  it("every result carries reasons and a version", () => {
    for (const lc of [null, "forest", "cropland", "built_up", "bare"] as const) {
      const r = classify(hot(), ctx({ landCover: lc }));
      expect(r.classifierVersion).toMatch(/^rules-/);
      expect(r.reasons.length).toBeGreaterThan(0);
    }
  });
});

describe("solarHour", () => {
  it("adds longitude/15 to UTC", () => {
    expect(solarHour("0800", 75)).toBeCloseTo(13, 5);
    expect(solarHour("23:30", 90)).toBeCloseTo(5.5, 5);
  });
});

describe("SiteIndex", () => {
  const area: IndustrialSite = {
    id: "way/9",
    name: "Steel Works",
    category: "steel",
    lat: 22.0,
    lon: 70.0,
    ring: [
      [69.99, 21.99],
      [70.01, 21.99],
      [70.01, 22.01],
      [69.99, 22.01],
    ],
  };
  const generic: IndustrialSite = { ...area, id: "way/10", name: null, category: "industrial_area" };

  it("matches inside an area (distance 0) and within buffer outside", () => {
    const idx = new SiteIndex([area]);
    expect(idx.nearest(22.0, 70.0)?.distanceM).toBe(0);
    const out = idx.nearest(22.0, 70.0135); // ≈ 0.0035° east of the edge ≈ 360 m
    expect(out).not.toBeNull();
    expect(out!.distanceM).toBeGreaterThan(200);
    expect(out!.distanceM).toBeLessThan(500);
    expect(idx.nearest(22.0, 70.05)).toBeNull();
  });

  it("prefers a specific facility over a generic industrial area", () => {
    const idx = new SiteIndex([generic, area]);
    expect(idx.nearest(22.0, 70.0)?.site.category).toBe("steel");
  });
});
