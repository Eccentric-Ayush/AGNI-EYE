/**
 * ESA WorldCover 2021 (10 m, CC BY 4.0) point sampler using HTTP range reads on the public
 * cloud-optimised GeoTIFFs (AWS Open Data). Offline/ingest use only — results are cached to
 * data/landcover-cache.json so each location is fetched once, ever.
 */
import fs from "node:fs";
import path from "node:path";
import { fromUrl } from "geotiff";
import type { LandCover } from "@/lib/classify/types";

const BASE = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map";
const CACHE_FILE = path.join(process.cwd(), "data", "landcover-cache.json");

/** WorldCover class code → classifier land cover. */
export function mapWorldCover(code: number): LandCover {
  switch (code) {
    case 10: // tree cover
    case 95: // mangroves
      return "forest";
    case 20: // shrubland
    case 30: // grassland
      return "shrub_grass";
    case 40:
      return "cropland";
    case 50:
      return "built_up";
    case 60: // bare / sparse vegetation
    case 70: // snow and ice
    case 100: // moss and lichen
      return "bare";
    case 80: // permanent water
    case 90: // herbaceous wetland
      return "wetland_water";
    default:
      return "other";
  }
}

function tileName(lat: number, lon: number): { name: string; s: number; w: number } {
  const s = Math.floor(lat / 3) * 3;
  const w = Math.floor(lon / 3) * 3;
  const ns = `${s >= 0 ? "N" : "S"}${String(Math.abs(s)).padStart(2, "0")}`;
  const ew = `${w >= 0 ? "E" : "W"}${String(Math.abs(w)).padStart(3, "0")}`;
  return { name: `ESA_WorldCover_10m_2021_v200_${ns}${ew}_Map.tif`, s, w };
}

type Image = Awaited<ReturnType<Awaited<ReturnType<typeof fromUrl>>["getImage"]>>;

const key = (lat: number, lon: number) => `${lat.toFixed(4)},${lon.toFixed(4)}`;

export class WorldCoverSampler {
  private images = new Map<string, Promise<Image | null>>();
  private cache: Record<string, LandCover | null> = {};
  private dirty = false;
  stats = { cached: 0, fetched: 0, failed: 0 };

  constructor() {
    try {
      this.cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    } catch {
      /* first run */
    }
  }

  private image(name: string): Promise<Image | null> {
    let p = this.images.get(name);
    if (!p) {
      p = (async () => {
        try {
          const tiff = await fromUrl(`${BASE}/${name}`, { allowFullFile: false });
          return await tiff.getImage();
        } catch {
          return null; // ocean tiles do not exist
        }
      })();
      this.images.set(name, p);
    }
    return p;
  }

  async sampleOne(lat: number, lon: number): Promise<LandCover | null> {
    const k = key(lat, lon);
    if (k in this.cache) {
      this.stats.cached++;
      return this.cache[k];
    }
    const t = tileName(lat, lon);
    const img = await this.image(t.name);
    let out: LandCover | null = null;
    if (img) {
      try {
        const w = img.getWidth();
        const h = img.getHeight();
        const x = Math.min(w - 1, Math.max(0, Math.floor(((lon - t.w) / 3) * w)));
        const y = Math.min(h - 1, Math.max(0, Math.floor(((t.s + 3 - lat) / 3) * h)));
        const r = (await img.readRasters({ window: [x, y, x + 1, y + 1] })) as unknown as ArrayLike<ArrayLike<number>>;
        out = mapWorldCover(r[0][0]);
        this.stats.fetched++;
      } catch {
        this.stats.failed++;
        return null; // do not cache transient failures
      }
    } else {
      out = "wetland_water"; // no land tile → open ocean
      this.stats.fetched++;
    }
    this.cache[k] = out;
    this.dirty = true;
    return out;
  }

  /** Sample many points; points are grouped by tile so COG blocks are reused. */
  async sampleMany(points: Array<{ lat: number; lon: number }>, concurrency = 6): Promise<Array<LandCover | null>> {
    const order = points
      .map((p, i) => ({ ...p, i, t: tileName(p.lat, p.lon).name, by: Math.floor(p.lat * 10), bx: Math.floor(p.lon * 10) }))
      .sort((a, b) => (a.t === b.t ? (a.by === b.by ? a.bx - b.bx : a.by - b.by) : a.t < b.t ? -1 : 1));
    const out: Array<LandCover | null> = new Array(points.length).fill(null);
    let next = 0;
    const worker = async () => {
      while (next < order.length) {
        const o = order[next++];
        out[o.i] = await this.sampleOne(o.lat, o.lon);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    this.save();
    return out;
  }

  save(): void {
    if (!this.dirty) return;
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache));
    this.dirty = false;
  }
}
