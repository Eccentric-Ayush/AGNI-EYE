import { requireAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Math.max(1, Math.min(200, parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10) || 50));
  const [alerts, unreadCount] = await Promise.all([
    db.fireAlert.findMany({ orderBy: { createdAt: "desc" }, take: limit }),
    db.fireAlert.count({ where: { acknowledged: false } }),
  ]);
  return NextResponse.json({ ok: true, alerts, unreadCount });
}

export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  await db.fireAlert.deleteMany({});
  return NextResponse.json({ ok: true });
}
