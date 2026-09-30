/** Loads the pre-built India industrial layer (data/industrial-india.json.gz). Server/script only. */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { IndustrialSite } from "@/lib/classify/types";
import { SiteIndex } from "@/lib/geo/site-index";

export interface SitesMeta {
  count: number;
  builtAt: string | null;
  source: string;
  /** Overpass chunks downloaded vs expected. `complete: false` = PARTIAL layer; the UI must say so. */
  coverage?: { chunksUsed: number; chunksTotal: number; complete: boolean };
}

interface SitesFile {
  source: string;
  builtAt: string;
  count: number;
  coverage?: { chunksUsed: number; chunksTotal: number; complete: boolean };
  byCategory?: Record<string, number>;
  sites: IndustrialSite[];
}

const FILE = path.join(process.cwd(), "data", "industrial-india.json.gz");

let cache: { mtimeMs: number; sites: IndustrialSite[]; meta: SitesMeta; index: SiteIndex } | null = null;

export function loadSites(): { sites: IndustrialSite[]; meta: SitesMeta; index: SiteIndex; available: boolean } {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(FILE);
  } catch {
    const empty: IndustrialSite[] = [];
    return {
      sites: empty,
      meta: { count: 0, builtAt: null, source: "not built — run `npm run build:industrial`" },
      index: new SiteIndex(empty),
      available: false,
    };
  }
  if (cache && cache.mtimeMs === stat.mtimeMs) return { ...cache, available: true };
  const file = JSON.parse(zlib.gunzipSync(fs.readFileSync(FILE)).toString("utf8")) as SitesFile;
  cache = {
    mtimeMs: stat.mtimeMs,
    sites: file.sites,
    meta: { count: file.count, builtAt: file.builtAt, source: file.source, coverage: file.coverage },
    index: new SiteIndex(file.sites),
  };
  return { ...cache, available: true };
}
