import { requireAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchSourceFires, type GibsSource } from "@/lib/nasa/gibs";
import { todayUtc } from "@/lib/nasa/registry";

export const dynamic = "force-dynamic";

/**
 * Scan every watched region against the LIVE GIBS hotspot feed (today, UTC)
 * and persist new detections as FireAlert rows (deduped at DB level).
 */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const t0 = Date.now();
  const regions = await db.watchRegion.findMany({ orderBy: { createdAt: "desc" } });
  if (regions.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, newAlerts: 0, message: "No watched regions yet." });
  }

  const today = todayUtc();
  const severityOf = (frp: number): string => {
    if (frp >= 200) return "extreme";
    if (frp >= 80) return "high";
    if (frp >= 20) return "moderate";
    return "low";
  };

  let newAlerts = 0;
  const perRegion: Array<{ region: string; hotspots: number; newAlerts: number }> = [];

  for (const region of regions) {
    const sources: GibsSource[] =
      region.sources && region.sources !== "all"
        ? (region.sources.split(",").filter(Boolean) as GibsSource[])
        : ["viirs_snpp", "viirs_noaa20", "modis_terra", "modis_aqua"];

    const results = await Promise.all(sources.map((s) => fetchSourceFires(s, { west: region.west, south: region.south, east: region.east, north: region.north }, today, { maxTiles: 24 })));
    const hotspots = results.flatMap((r) => r.features);

    let created = 0;
    for (const f of hotspots) {
      const p = f.properties;
      try {
        await db.fireAlert.create({
          data: {
            regionName: region.name,
            lat: p.latitude,
            lon: p.longitude,
            brightness: p.brightness,
            frp: p.frp,
            satellite: p.satellite,
            acquiredAt: `${p.acqDate} ${p.acqTime} UTC`,
            dayNight: p.dayNight,
            severity: severityOf(p.frp),
          },
        });
        created++;
      } catch {
        // unique constraint -> already alerted; ignore
      }
    }
    newAlerts += created;
    perRegion.push({ region: region.name, hotspots: hotspots.length, newAlerts: created });
  }

  return NextResponse.json({
    ok: true,
    scanned: regions.length,
    newAlerts,
    perRegion,
    fetchMs: Date.now() - t0,
    checkedAt: new Date().toISOString(),
  });
}
