/**
 * Build data/india-boundary.json (simplified MultiPolygon rings) from Natural Earth 10m admin-0
 * "India perspective" countries (public domain). Usage: npm run build:boundary
 *
 * NOTE: this is a analysis clip, not an authoritative depiction of India's boundary.
 */
import fs from "node:fs";
import path from "node:path";

const SRC =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_ind.geojson";
const TOLERANCE_DEG = 0.01; // ~1 km
const MIN_AREA_DEG2 = 0.002; // drop specks; keeps Andaman/Nicobar/Lakshadweep islands that matter

type Pt = [number, number];

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

function ringArea(r: Pt[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}

async function main() {
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const gj = (await res.json()) as { features: Array<{ properties: Record<string, string>; geometry: { type: string; coordinates: any } }> };
  const f = gj.features.find((x) => x.properties.ADM0_A3 === "IND");
  if (!f) throw new Error("India feature not found");
  const polys: Pt[][][] = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings: Pt[][] = [];
  for (const poly of polys) {
    const outer = poly[0] as Pt[];
    if (ringArea(outer) < MIN_AREA_DEG2) continue;
    const s = simplify(outer, TOLERANCE_DEG).map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] as Pt);
    if (s.length >= 4) rings.push(s);
  }
  const out = {
    source: "Natural Earth 10m admin-0 countries, India perspective (public domain)",
    note: "Simplified analysis clip; not an authoritative depiction of India's boundary.",
    builtAt: new Date().toISOString(),
    rings,
  };
  const file = path.join(process.cwd(), "data", "india-boundary.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(`wrote ${file}: ${rings.length} rings, ${rings.reduce((n, r) => n + r.length, 0)} points, ${fs.statSync(file).size} bytes`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
