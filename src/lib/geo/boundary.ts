/**
 * India analysis boundary (simplified Natural Earth, India perspective). Used to clip ingestion and
 * classification to India. Loaded lazily from data/india-boundary.json (server only).
 */
import fs from "node:fs";
import path from "node:path";
import { INDIA_BBOX, inBbox, pointInRing } from "./geo";

interface BoundaryFile {
  rings: Array<Array<[number, number]>>;
}

let cached: Array<Array<[number, number]>> | null = null;

export function loadIndiaRings(): Array<Array<[number, number]>> {
  if (cached) return cached;
  const file = path.join(process.cwd(), "data", "india-boundary.json");
  cached = (JSON.parse(fs.readFileSync(file, "utf8")) as BoundaryFile).rings;
  return cached;
}

export function inIndia(lat: number, lon: number, rings = loadIndiaRings()): boolean {
  if (!inBbox(lat, lon, INDIA_BBOX)) return false;
  for (const r of rings) if (pointInRing(lat, lon, r)) return true;
  return false;
}
