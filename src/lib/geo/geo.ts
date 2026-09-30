/**
 * Small, dependency-free geo helpers used by the classification pipeline.
 * All coordinates are WGS84 degrees; distances are metres.
 */

const R = 6371008.8; // mean Earth radius (m)
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Thermal-cell grid. ~0.005° ≈ 555 m of latitude — wider than a 375 m VIIRS pixel so the
 * same site seen by different satellites / overpasses (pixel-centre jitter) lands in the same
 * or an adjacent cell. Persistence is computed over the 3×3 neighbourhood.
 */
export const CELL_DEG = 0.005;

export interface CellKey {
  i: number; // latitude index
  j: number; // longitude index
}

export function cellOf(lat: number, lon: number): CellKey {
  return { i: Math.floor(lat / CELL_DEG), j: Math.floor(lon / CELL_DEG) };
}

export function cellId(lat: number, lon: number): string {
  const c = cellOf(lat, lon);
  return `${c.i}_${c.j}`;
}

export function cellIdOf(c: CellKey): string {
  return `${c.i}_${c.j}`;
}

/** The cell itself plus its 8 neighbours. */
export function neighbourhood(c: CellKey): string[] {
  const out: string[] = [];
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) out.push(cellIdOf({ i: c.i + di, j: c.j + dj }));
  return out;
}

export function cellCenter(id: string): { lat: number; lon: number } {
  const [i, j] = id.split("_").map(Number);
  return { lat: (i + 0.5) * CELL_DEG, lon: (j + 0.5) * CELL_DEG };
}

/** Local equirectangular projection around a reference latitude; good to <0.1 % at site scale. */
function project(lat: number, lon: number, refLat: number): [number, number] {
  return [toRad(lon) * Math.cos(toRad(refLat)) * R, toRad(lat) * R];
}

function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Ray-casting point-in-polygon on a single ring of [lon, lat] pairs. */
export function pointInRing(lat: number, lon: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance (m) from a point to a ring: 0 if inside, otherwise distance to the nearest edge. */
export function distanceToRingMeters(lat: number, lon: number, ring: Array<[number, number]>): number {
  if (ring.length < 3) return Infinity;
  if (pointInRing(lat, lon, ring)) return 0;
  const [px, py] = project(lat, lon, lat);
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const [ax, ay] = project(a[1], a[0], lat);
    const [bx, by] = project(b[1], b[0], lat);
    best = Math.min(best, pointSegmentDistance(px, py, ax, ay, bx, by));
  }
  return best;
}

export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export const INDIA_BBOX: Bbox = { west: 68, south: 6, east: 98, north: 37.5 };

export function inBbox(lat: number, lon: number, b: Bbox): boolean {
  return lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
