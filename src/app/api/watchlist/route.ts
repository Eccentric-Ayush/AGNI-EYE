import { requireAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const regions = await db.watchRegion.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ ok: true, regions });
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const body = (await req.json()) as {
      name?: string;
      west?: number;
      south?: number;
      east?: number;
      north?: number;
      sources?: string;
    };
    const name = (body.name ?? "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Region name is required." }, { status: 400 });
    const nums = [body.west, body.south, body.east, body.north];
    if (nums.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
      return NextResponse.json({ ok: false, error: "Valid bbox (west/south/east/north) is required." }, { status: 400 });
    }
    const region = await db.watchRegion.create({
      data: {
        name: name.slice(0, 80),
        west: body.west!,
        south: body.south!,
        east: body.east!,
        north: body.north!,
        sources: (body.sources ?? "all").slice(0, 120),
      },
    });
    return NextResponse.json({ ok: true, region });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
