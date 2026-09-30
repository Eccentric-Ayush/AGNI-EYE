/**
 * Build data/industrial-india.json.gz — India industrial / energy / mining / landfill features from
 * OpenStreetMap (ODbL, © OpenStreetMap contributors) via the public Overpass API.
 *
 * Runs OFFLINE (not at request time): chunked 2°×2°, polite (sequential + pause), resumable
 * (per-chunk cache in data/raw/overpass/). Usage: npm run build:industrial [-- --refresh]
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { INDIA_BBOX } from "../src/lib/geo/geo";
import { inIndia, loadIndiaRings } from "../src/lib/geo/boundary";
import type { IndustrialSite, SiteCategory } from "../src/lib/classify/types";

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
const WORKERS = 4; // 2 per public server (overpass-api.de allows 2 slots per client)
const UA = "agni-eye-sih2026/0.1 (research prototype; contact via GitHub Eccentric-Ayush/AGNI-EYE)";
const CHUNK = 2; // degrees
const PAUSE_MS = 1500;
const CACHE_DIR = path.join(process.cwd(), "data", "raw", "overpass");

const refresh = process.argv.includes("--refresh");
const fromCache = process.argv.includes("--from-cache"); // build from already-downloaded chunks only (partial layer)

type Pt = [number, number];

interface OsmEl {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{ type: string; role: string; geometry?: Array<{ lat: number; lon: number }> }>;
  tags?: Record<string, string>;
}

export function categorize(t: Record<string, string>): SiteCategory | null {
  const industrial = (t.industrial ?? "").toLowerCase();
  const product = (t.product ?? "").toLowerCase();
  if (t.man_made === "offshore_platform") return "offshore_platform";
  if (t.man_made === "flare") return "flare";
  if (t.power === "plant") {
    const src = (t["plant:source"] ?? "").toLowerCase();
    return /solar|wind|hydro|water|tidal|geothermal/.test(src) ? null : "power_plant";
  }
  if (/refiner/.test(industrial) || (t.man_made === "works" && /petrol|oil|fuel|diesel/.test(product))) return "refinery";
  if (industrial === "oil" || /oil_terminal|depot/.test(industrial)) return "oil_depot";
  if (/steel|iron|metal/.test(industrial) || /steel|iron/.test(product)) return "steel";
  if (/cement/.test(industrial) || /cement/.test(product)) return "cement";
  if (/chemical|petrochem|fertili/.test(industrial) || /chemical|fertili|petrochem/.test(product)) return "chemical";
  if (/gas|lng/.test(industrial)) return "gas_lng";
  if (t.man_made === "kiln" || /brick/.test(industrial) || /brick/.test(product) || t.craft === "brickmaker") return "kiln";
  if (t.landuse === "quarry" || industrial === "mine" || t.man_made === "mineshaft") return "mining";
  if (t.landuse === "landfill") return "landfill";
  if (t.landuse === "industrial" || t.man_made === "works") return "industrial_area";
  return null;
}

function sqSegDist(p: Pt, a: Pt, b: Pt): number {
  let [x, y] = a;
  let dx = b[0] - x,
    dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) [x, y] = b;
    else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length <= 4) return pts;
  const sq = tol * tol;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let max = sq,
      idx = -1;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(pts[i], pts[first], pts[last]);
      if (d > max) {
        idx = i;
        max = d;
      }
    }
    if (idx > -1) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, last]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

function toSite(el: OsmEl): IndustrialSite | null {
  const tags = el.tags ?? {};
  const category = categorize(tags);
  if (!category) return null;
  let ringPts: Pt[] | null = null;
  if (el.type === "way" && el.geometry && el.geometry.length >= 4) {
    ringPts = el.geometry.map((g) => [g.lon, g.lat] as Pt);
  } else if (el.type === "relation" && el.members) {
    const outer = el.members.find((m) => m.role === "outer" && m.geometry && m.geometry.length >= 4);
    if (outer?.geometry) ringPts = outer.geometry.map((g) => [g.lon, g.lat] as Pt);
  }
  let lat: number, lon: number;
  if (el.type === "node" && el.lat != null && el.lon != null) {
    lat = el.lat;
    lon = el.lon;
  } else if (el.bounds) {
    lat = (el.bounds.minlat + el.bounds.maxlat) / 2;
    lon = (el.bounds.minlon + el.bounds.maxlon) / 2;
  } else if (ringPts) {
    lat = ringPts.reduce((s, p) => s + p[1], 0) / ringPts.length;
    lon = ringPts.reduce((s, p) => s + p[0], 0) / ringPts.length;
  } else return null;

  const site: IndustrialSite = {
    id: `${el.type}/${el.id}`,
    name: tags["name:en"] ?? tags.name ?? null,
    category,
    lat: r5(lat),
    lon: r5(lon),
  };
  if (ringPts) {
    const simp = simplify(ringPts, 0.00005).map(([x, y]) => [r5(x), r5(y)] as Pt);
    if (simp.length >= 4) site.ring = simp;
  }
  return site;
}

function queryFor(b: { s: number; w: number; n: number; e: number }): string {
  const bb = `${b.s},${b.w},${b.n},${b.e}`;
  return `[out:json][timeout:180];
(
  nwr["landuse"~"^(industrial|quarry|landfill)$"](${bb});
  nwr["industrial"](${bb});
  nwr["man_made"~"^(works|flare|kiln|offshore_platform|mineshaft)$"](${bb});
  nwr["power"="plant"](${bb});
  nwr["craft"="brickmaker"](${bb});
);
out tags geom;`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchChunk(b: { s: number; w: number; n: number; e: number }, epStart: number): Promise<OsmEl[]> {
  const body = new URLSearchParams({ data: queryFor(b) }).toString();
  let lastErr = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const ep = ENDPOINTS[(epStart + attempt) % ENDPOINTS.length];
    try {
      const res = await fetch(ep, {
        method: "POST",
        headers: { "User-Agent": UA, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(240_000),
      });
      if (res.ok) {
        const j = (await res.json()) as { elements?: OsmEl[]; remark?: string };
        if (j.remark && /runtime error|timed out/i.test(j.remark)) throw new Error(j.remark);
        return j.elements ?? [];
      }
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await sleep(5000 * (attempt + 1));
  }
  throw new Error(`chunk ${JSON.stringify(b)} failed: ${lastErr}`);
}

function chunkTouchesIndia(b: { s: number; w: number; n: number; e: number }, rings: Pt[][]): boolean {
  for (let i = 0; i <= 8; i++)
    for (let j = 0; j <= 8; j++) {
      const lat = b.s + ((b.n - b.s) * i) / 8;
      const lon = b.w + ((b.e - b.w) * j) / 8;
      if (inIndia(lat, lon, rings)) return true;
    }
  return false;
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const rings = loadIndiaRings();
  const chunks: Array<{ s: number; w: number; n: number; e: number }> = [];
  for (let s = Math.floor(INDIA_BBOX.south); s < INDIA_BBOX.north; s += CHUNK)
    for (let w = Math.floor(INDIA_BBOX.west); w < INDIA_BBOX.east; w += CHUNK) {
      const b = { s, w, n: s + CHUNK, e: w + CHUNK };
      if (chunkTouchesIndia(b, rings)) chunks.push(b);
    }
  console.log(`${chunks.length} chunks intersect India`);

  const sites = new Map<string, IndustrialSite>();
  let done = 0;
  let next = 0;
  const cachePath = (b: { s: number; w: number }) => path.join(CACHE_DIR, `${b.s}_${b.w}.json`);
  // Workers alternate between the two public servers.
  const worker = async (wi: number) => {
    while (next < chunks.length) {
      const b = chunks[next++];
      const file = cachePath(b);
      if (!fromCache && (refresh || !fs.existsSync(file))) {
        const t0 = Date.now();
        try {
          let els: OsmEl[];
          try {
            els = await fetchChunk(b, wi);
          } catch {
            // Dense area: retry as four 1° sub-queries and merge.
            const h = (b.n - b.s) / 2;
            const w = (b.e - b.w) / 2;
            els = [];
            for (const [ds, dw] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
              els.push(...(await fetchChunk({ s: b.s + ds * h, w: b.w + dw * w, n: b.s + (ds + 1) * h, e: b.w + (dw + 1) * w }, wi)));
            }
          }
          const seenIds = new Set<string>();
          els = els.filter((e) => (seenIds.has(`${e.type}/${e.id}`) ? false : (seenIds.add(`${e.type}/${e.id}`), true)));
          fs.writeFileSync(file, JSON.stringify(els));
          console.log(`[w${wi}] chunk s=${b.s} w=${b.w}: ${els.length} elements in ${Date.now() - t0}ms`);
        } catch (e) {
          console.error(`[w${wi}] SKIPPED chunk s=${b.s} w=${b.w}: ${e instanceof Error ? e.message : e}`);
        }
        await sleep(PAUSE_MS);
      }
      done++;
      if (done % 10 === 0) console.log(`progress ${done}/${chunks.length}`);
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i)));
  let chunksUsed = 0;
  for (const b of chunks) {
    let els: OsmEl[];
    try {
      els = JSON.parse(fs.readFileSync(cachePath(b), "utf8"));
    } catch {
      continue; // chunk not downloaded yet (or mid-write)
    }
    chunksUsed++;
    for (const el of els) {
      const s = toSite(el);
      if (s && inIndia(s.lat, s.lon, rings)) sites.set(s.id, s);
    }
  }

  const list = [...sites.values()];
  const byCat: Record<string, number> = {};
  for (const s of list) byCat[s.category] = (byCat[s.category] ?? 0) + 1;
  const out = {
    source: "OpenStreetMap contributors (ODbL) via Overpass API",
    builtAt: new Date().toISOString(),
    count: list.length,
    coverage: { chunksUsed, chunksTotal: chunks.length, complete: chunksUsed === chunks.length },
    byCategory: byCat,
    sites: list,
  };
  const file = path.join(process.cwd(), "data", "industrial-india.json.gz");
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(out)));
  console.log(`wrote ${file}: ${list.length} sites from ${chunksUsed}/${chunks.length} chunks${chunksUsed === chunks.length ? "" : " (PARTIAL LAYER)"}, ${fs.statSync(file).size} bytes`, byCat);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
