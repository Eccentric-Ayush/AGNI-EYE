import { NextRequest, NextResponse } from "next/server";
import { deleteSetting, resolveFirmsMapKey, SETTING_KEYS, setSetting } from "@/lib/nasa/settings";

export const dynamic = "force-dynamic";

function mask(key: string): string {
  if (key.length <= 6) return "••••••";
  return `${key.slice(0, 3)}••••••••${key.slice(-4)}`;
}

export async function GET() {
  const key = await resolveFirmsMapKey();
  return NextResponse.json({
    ok: true,
    firmsMapKey: {
      configured: Boolean(key),
      masked: key ? mask(key) : null,
      source: key ? (process.env.FIRMS_MAP_KEY && !process.env.FIRMS_MAP_KEY.trim() ? "env" : "database") : null,
    },
    registerUrl: "https://firms.modaps.eosdis.nasa.gov/api/map_key/",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { mapKey?: string; action?: "clear" };
    if (body.action === "clear") {
      await deleteSetting(SETTING_KEYS.firmsMapKey);
      return NextResponse.json({ ok: true, cleared: true });
    }
    const key = (body.mapKey ?? "").trim();
    if (!key || key.length < 8 || !/^[A-Za-z0-9\-]+$/.test(key)) {
      return NextResponse.json({ ok: false, error: "MAP_KEY looks invalid (expected a token like abc123def…)." }, { status: 400 });
    }
    await setSetting(SETTING_KEYS.firmsMapKey, key);
    return NextResponse.json({ ok: true, configured: true, masked: mask(key) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
