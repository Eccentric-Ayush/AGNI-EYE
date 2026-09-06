import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const region = await db.watchRegion.findUnique({ where: { id } });
    if (!region) {
      return NextResponse.json({ ok: false, error: "Region not found." }, { status: 404 });
    }
    await db.fireAlert.deleteMany({ where: { regionName: region.name } });
    await db.watchRegion.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Region not found." }, { status: 404 });
  }
}
