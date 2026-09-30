/**
 * In-memory spatial index over industrial sites (bucket grid). Adequate for tens of thousands of
 * sites; swap for PostGIS ST_DWithin when the DB lands (same SiteMatch contract).
 */

import { CLASSIFIER_CONFIG } from "@/lib/classify/config";
import type { IndustrialSite, SiteMatch } from "@/lib/classify/types";
import { distanceToRingMeters, haversineMeters } from "./geo";

const BUCKET_DEG = 0.05; // ~5.5 km

const bucketKey = (bi: number, bj: number) => `${bi}_${bj}`;

export class SiteIndex {
  private buckets = new Map<string, IndustrialSite[]>();
  readonly size: number;

  constructor(sites: IndustrialSite[]) {
    for (const s of sites) {
      let south = s.lat,
        north = s.lat,
        west = s.lon,
        east = s.lon;
      if (s.ring && s.ring.length) {
        for (const [lon, lat] of s.ring) {
          south = Math.min(south, lat);
          north = Math.max(north, lat);
          west = Math.min(west, lon);
          east = Math.max(east, lon);
        }
      }
      // Register the site in every bucket its bbox touches (capped to avoid pathological huge areas).
      const i0 = Math.floor(south / BUCKET_DEG),
        i1 = Math.floor(north / BUCKET_DEG),
        j0 = Math.floor(west / BUCKET_DEG),
        j1 = Math.floor(east / BUCKET_DEG);
      if ((i1 - i0 + 1) * (j1 - j0 + 1) > 400) {
        const k = bucketKey(Math.floor(s.lat / BUCKET_DEG), Math.floor(s.lon / BUCKET_DEG));
        (this.buckets.get(k) ?? this.buckets.set(k, []).get(k)!).push(s);
        continue;
      }
      for (let bi = i0; bi <= i1; bi++)
        for (let bj = j0; bj <= j1; bj++) {
          const k = bucketKey(bi, bj);
          (this.buckets.get(k) ?? this.buckets.set(k, []).get(k)!).push(s);
        }
    }
    this.size = sites.length;
  }

  private distance(s: IndustrialSite, lat: number, lon: number): number {
    if (s.ring && s.ring.length >= 3) return distanceToRingMeters(lat, lon, s.ring);
    return haversineMeters(lat, lon, s.lat, s.lon);
  }

  /** Nearest site within its category-appropriate buffer, or null. */
  nearest(lat: number, lon: number): SiteMatch | null {
    const maxM = Math.max(CLASSIFIER_CONFIG.siteBufferAreaM, CLASSIFIER_CONFIG.siteBufferPointM);
    const pad = Math.ceil(maxM / 111_000 / BUCKET_DEG) || 1;
    const bi = Math.floor(lat / BUCKET_DEG);
    const bj = Math.floor(lon / BUCKET_DEG);
    let best: SiteMatch | null = null;
    const seen = new Set<string>();
    for (let di = -pad; di <= pad; di++)
      for (let dj = -pad; dj <= pad; dj++) {
        const list = this.buckets.get(bucketKey(bi + di, bj + dj));
        if (!list) continue;
        for (const s of list) {
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          const d = this.distance(s, lat, lon);
          const limit = s.ring ? CLASSIFIER_CONFIG.siteBufferAreaM : CLASSIFIER_CONFIG.siteBufferPointM;
          if (d > limit) continue;
          // Specific facility beats a generic industrial area; otherwise nearest wins.
          if (!best || rank(s) > rank(best.site) || (rank(s) === rank(best.site) && d < best.distanceM)) {
            best = { site: s, distanceM: d };
          }
        }
      }
    return best;
  }
}

/** Prefer specific facilities over generic industrial areas when distances tie (e.g. both contain the point). */
function rank(s: IndustrialSite): number {
  return s.category === "industrial_area" ? 0 : 1;
}
