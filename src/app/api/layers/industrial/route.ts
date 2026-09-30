import { NextRequest, NextResponse } from "next/server";
import { loadSites } from "@/lib/pipeline/sites";
import { parseBbox } from "@/lib/pipeline/query";
import { queryIndustrialLayer, tryDb } from "@/lib/store/postgres";

export const dynamic = "force-dynamic";

const MAX = 3000;

/** Industrial / energy / mining / landfill features (OSM, ODbL) inside a bbox, as GeoJSON for map overlay. PostGIS (GiST) first, files as fallback. */
export async function GET(req: NextRequest) {
  const bbox = parseBbox(req.nextUrl.searchParams);
  if (!bbox) return NextResponse.json({ ok: false, error: "west/south/east/north are required." }, { status: 400 });
  const cats = req.nextUrl.searchParams.get("categories")?.split(",").filter(Boolean);

  const fromDb = await tryDb(() => queryIndustrialLayer(bbox, cats, MAX));
  if (fromDb) {
    return NextResponse.json({
      type: "FeatureCollection",
      store: "postgis",
      attribution: "© OpenStreetMap contributors (ODbL)",
      total: fromDb.total,
      matched: fromDb.matched,
      truncated: fromDb.matched > MAX,
      features: fromDb.features,
    });
  }

  const { sites, meta, available } = loadSites();
  if (!available) {
    return NextResponse.json({ ok: false, error: "Industrial layer not built yet. Run `npm run build:industrial`." }, { status: 503 });
  }

  const feats: unknown[] = [];
  let matched = 0;
  for (const s of sites) {
    if (s.lat < bbox.south || s.lat > bbox.north || s.lon < bbox.west || s.lon > bbox.east) continue;
    if (cats && !cats.includes(s.category)) continue;
    matched++;
    if (feats.length >= MAX) continue;
    feats.push({
      type: "Feature",
      geometry: s.ring ? { type: "Polygon", coordinates: [s.ring] } : { type: "Point", coordinates: [s.lon, s.lat] },
      properties: { id: s.id, name: s.name, category: s.category, lat: s.lat, lon: s.lon },
    });
  }
  return NextResponse.json({
    type: "FeatureCollection",
    store: "files",
    attribution: "© OpenStreetMap contributors (ODbL)",
    builtAt: meta.builtAt,
    total: meta.count,
    matched,
    truncated: matched > MAX,
    features: feats,
  });
}
