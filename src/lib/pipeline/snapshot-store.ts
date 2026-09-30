/**
 * Snapshot persistence (file-backed). This is the REPLAY/default data source until the Postgres
 * store lands — it holds real archived detections only, never synthetic data.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { Snapshot } from "./types";

const FILE = path.join(process.cwd(), "data", "snapshot", "latest.json.gz");

let cache: { mtimeMs: number; snap: Snapshot } | null = null;

export function snapshotPath(): string {
  return FILE;
}

export function writeSnapshot(snap: Snapshot): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, zlib.gzipSync(JSON.stringify(snap)));
  cache = null;
}

export function readSnapshot(): Snapshot | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(FILE);
  } catch {
    return null;
  }
  if (cache && cache.mtimeMs === stat.mtimeMs) return cache.snap;
  const snap = JSON.parse(zlib.gunzipSync(fs.readFileSync(FILE)).toString("utf8")) as Snapshot;
  cache = { mtimeMs: stat.mtimeMs, snap };
  return snap;
}
