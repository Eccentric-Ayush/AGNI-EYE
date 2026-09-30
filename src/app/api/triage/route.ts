import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { loadOr503, noSnapshotResponse, selectDates, snapshotAgeHours } from "@/lib/pipeline/query";
import { getAvailableDates, getMeta, pickDates, queryTriage, setTriageStatus, tryDb, type TriageStatus } from "@/lib/store/postgres";

export const dynamic = "force-dynamic";

/** Ranked queue of non-routine industrial heat (deduplicated per location and day). PostGIS first (with analyst status), files as fallback. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const fromDb = await tryDb(async () => {
    const [meta, available] = await Promise.all([getMeta(), getAvailableDates()]);
    const dates = pickDates(available, sp.get("date"), sp.get("days"));
    const items = await queryTriage(dates);
    return {
      ok: true,
      store: "postgis",
      sharedStatus: true,
      generatedAt: meta.generatedAt,
      ageHours: meta.ageHours,
      dates,
      count: items.length,
      counts: { review: items.filter((t) => t.priority === "review").length, watch: items.filter((t) => t.priority === "watch").length },
      items,
    };
  });
  if (fromDb) return NextResponse.json(fromDb);

  const snap = loadOr503();
  if (!snap) return noSnapshotResponse();
  const dates = new Set(selectDates(snap, sp));
  const items = snap.triage.filter((t) => dates.has(t.acqDate));
  return NextResponse.json({
    ok: true,
    store: "files",
    sharedStatus: false,
    generatedAt: snap.generatedAt,
    ageHours: snapshotAgeHours(snap),
    dates: [...dates].sort(),
    count: items.length,
    counts: {
      review: items.filter((t) => t.priority === "review").length,
      watch: items.filter((t) => t.priority === "watch").length,
    },
    items,
  });
}

/** Acknowledge / dismiss / reopen an item, shared across analysts. Needs the database and the admin secret. */
export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  let body: { key?: string; status?: string };
  try {
    body = (await req.json()) as { key?: string; status?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const key = typeof body.key === "string" ? body.key.slice(0, 80) : "";
  const status = body.status as TriageStatus;
  if (!/^\d{4}-\d{2}-\d{2}\|-?\d+_-?\d+$/.test(key) || !["open", "ack", "dismissed"].includes(status)) {
    return NextResponse.json({ ok: false, error: "Expected { key: '<date>|<cell>', status: 'open'|'ack'|'dismissed' }." }, { status: 400 });
  }
  const done = await tryDb(() => setTriageStatus(key, status));
  if (done === null) return NextResponse.json({ ok: false, error: "Shared status needs the database, which is unavailable." }, { status: 503 });
  if (!done) return NextResponse.json({ ok: false, error: "Triage item not found." }, { status: 404 });
  return NextResponse.json({ ok: true, key, status });
}
