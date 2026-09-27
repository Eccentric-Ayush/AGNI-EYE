import { NextRequest, NextResponse } from "next/server";
import { fetchEonetWildfires } from "@/lib/nasa/eonet";
import { cacheGetFresh, cacheSet, CACHE_TTL } from "@/lib/nasa/cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = (sp.get("status") === "all" ? "all" : sp.get("status") === "closed" ? "closed" : "open") as
    | "open"
    | "closed"
    | "all";
  const days = Math.max(1, Math.min(90, parseInt(sp.get("days") ?? "30", 10) || 30));
  const limit = Math.max(1, Math.min(200, parseInt(sp.get("limit") ?? "80", 10) || 80));

  const cacheKey = `eonet:${status}:${days}:${limit}`;
  const fresh = cacheGetFresh(cacheKey, CACHE_TTL.eonet);
  if (fresh) {
    return NextResponse.json({ ...fresh.value, cached: true, cacheAge: Math.round(fresh.age / 1000) });
  }

  const res = await fetchEonetWildfires({ status, days, limit });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error, events: [] }, { status: 502 });
  }
  const payload = { ok: true, events: res.events, cached: false, cacheAge: 0, generatedAt: new Date().toISOString() };
  cacheSet(cacheKey, payload);
  return NextResponse.json(payload);
}
