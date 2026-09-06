import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [regions, alerts, settings] = await Promise.all([
      db.watchRegion.count(),
      db.fireAlert.count(),
      db.setting.count(),
    ]);
    return NextResponse.json({
      ok: true,
      service: "Agni Eye Command",
      database: "connected",
      counts: { watchRegions: regions, fireAlerts: alerts, settings },
      time: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "database error" },
      { status: 500 }
    );
  }
}
