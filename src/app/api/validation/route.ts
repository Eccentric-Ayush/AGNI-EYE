import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Validation results produced by `npm run evaluate` (data/validation/results.json). */
export async function GET() {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "data", "validation", "results.json"), "utf8");
    return NextResponse.json({ ok: true, ...JSON.parse(raw) });
  } catch {
    return NextResponse.json({
      ok: true,
      available: false,
      message: "No validation has been run. Add externally verified sites to data/validation/sites.json and run `npm run evaluate`.",
    });
  }
}
