import { NextRequest, NextResponse } from "next/server";
import { fetchFirmsArea } from "@/lib/nasa/firms";
import { resolveFirmsMapKey } from "@/lib/nasa/settings";

export const dynamic = "force-dynamic";

/**
 * Validate a FIRMS MAP_KEY by issuing a tiny area query.
 * Probe bbox deliberately empty of land where possible (open Atlantic).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { mapKey?: string };
    const key = (body.mapKey ?? "").trim() || (await resolveFirmsMapKey());
    if (!key) {
      return NextResponse.json(
        { ok: false, valid: null, reachable: null, error: "No MAP_KEY provided." },
        { status: 400 }
      );
    }
    // Small Atlantic box => minimal payload; still validates the key.
    const res = await fetchFirmsArea(
      { mapKey: key, sources: "viirs_snpp_24h", bbox: { west: -30, south: -20, east: -25, north: -15 }, dayRange: 1 },
      12000
    );
    if (!res.reachable) {
      return NextResponse.json({
        ok: true,
        valid: null,
        reachable: false,
        error: res.error,
        hint: "This server cannot reach firms.modaps.eosdis.nasa.gov. The key may still be valid — the app uses GIBS live data regardless.",
      });
    }
    if (!res.ok) {
      return NextResponse.json({ ok: true, valid: false, reachable: true, error: res.error });
    }
    return NextResponse.json({ ok: true, valid: true, reachable: true, message: "MAP_KEY is valid and active." });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
