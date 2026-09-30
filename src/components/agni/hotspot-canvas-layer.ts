import L from "leaflet";
import type { HotspotListItem } from "@/lib/pipeline/types";
import { CLASS_META, DRAW_PRIORITY, RAW_COLOR, type Shape } from "./class-meta";

const PANE = "agni-hotspots";
const PAD = 0.5; // canvas is 2× the viewport so short drags never expose blank edges

interface Hit {
  x: number; // container px
  y: number;
  r: number;
  item: HotspotListItem;
}

export function markerRadius(frp: number): number {
  return Math.max(4, Math.min(10, 3.5 + Math.log10(Math.max(1, frp)) * 2.5));
}

function tracePath(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, r: number) {
  ctx.beginPath();
  switch (shape) {
    case "triangle":
      ctx.moveTo(x, y - r * 1.1);
      ctx.lineTo(x + r * 1.05, y + r * 0.85);
      ctx.lineTo(x - r * 1.05, y + r * 0.85);
      ctx.closePath();
      break;
    case "square":
      ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
      break;
    case "diamond":
      ctx.moveTo(x, y - r * 1.15);
      ctx.lineTo(x + r * 1.15, y);
      ctx.lineTo(x, y + r * 1.15);
      ctx.lineTo(x - r * 1.15, y);
      ctx.closePath();
      break;
    case "hexagon":
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        const px = x + Math.cos(a) * r * 1.05;
        const py = y + Math.sin(a) * r * 1.05;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    case "ring":
    case "circle":
      ctx.arc(x, y, shape === "ring" ? r * 0.85 : r, 0, Math.PI * 2);
      break;
  }
}

/**
 * Canvas layer drawing class-shaped markers for thousands of detections, with nearest-point
 * hit-testing for click and hover. Class → colour + shape (see class-meta.ts).
 */
export class HotspotCanvasLayer extends L.Layer {
  private canvas: HTMLCanvasElement | null = null;
  private items: HotspotListItem[] = [];
  private raw = false;
  private selectedId: string | null = null;
  private hits: Hit[] = [];
  private raf = 0;
  private hoverRaf = 0;
  private onPick: (item: HotspotListItem | null) => void;

  constructor(onPick: (item: HotspotListItem | null) => void) {
    super();
    this.onPick = onPick;
  }

  setOnPick(fn: (item: HotspotListItem | null) => void) {
    this.onPick = fn;
  }

  update(items: HotspotListItem[], raw: boolean, selectedId: string | null) {
    // Least important first, so anomalies are painted on top.
    this.items = [...items].sort((a, b) => DRAW_PRIORITY[a.class] - DRAW_PRIORITY[b.class] || a.frp - b.frp);
    this.raw = raw;
    this.selectedId = selectedId;
    this.schedule();
  }

  onAdd(map: L.Map): this {
    if (!map.getPane(PANE)) {
      const pane = map.createPane(PANE);
      pane.style.zIndex = "450";
      pane.style.pointerEvents = "none";
    }
    const c = L.DomUtil.create("canvas", "agni-hotspot-canvas") as HTMLCanvasElement;
    c.setAttribute("aria-hidden", "true");
    c.style.position = "absolute";
    this.canvas = c;
    map.getPane(PANE)!.appendChild(c);
    this.reset();
    return this;
  }

  onRemove(map: L.Map): this {
    if (this.canvas) L.DomUtil.remove(this.canvas);
    this.canvas = null;
    map.getContainer().style.cursor = "";
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.hoverRaf);
    return this;
  }

  getEvents(): Record<string, L.LeafletEventHandlerFn> {
    return {
      moveend: () => this.reset(),
      zoomend: () => this.reset(),
      resize: () => this.reset(),
      click: ((e: L.LeafletMouseEvent) => this.handleClick(e)) as L.LeafletEventHandlerFn,
      mousemove: ((e: L.LeafletMouseEvent) => this.handleHover(e)) as L.LeafletEventHandlerFn,
    };
  }

  private schedule() {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.reset());
  }

  /** Re-anchor the padded canvas to the current viewport and repaint. */
  private reset() {
    const map = (this as unknown as { _map?: L.Map })._map;
    const c = this.canvas;
    if (!map || !c) return;
    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(size.x * (1 + 2 * PAD));
    const h = Math.round(size.y * (1 + 2 * PAD));
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    const origin = map.containerPointToLayerPoint([-size.x * PAD, -size.y * PAD]);
    L.DomUtil.setPosition(c, origin);
    this.draw(map, c, dpr, size);
  }

  private draw(map: L.Map, c: HTMLCanvasElement, dpr: number, size: L.Point) {
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width / dpr, c.height / dpr);
    const offX = size.x * PAD;
    const offY = size.y * PAD;
    const maxX = size.x * (1 + PAD) + 12;
    const maxY = size.y * (1 + PAD) + 12;
    const minX = -size.x * PAD - 12;
    const minY = -size.y * PAD - 12;
    this.hits = [];
    let selected: Hit | null = null;

    ctx.lineWidth = 1;
    for (const it of this.items) {
      const p = map.latLngToContainerPoint([it.lat, it.lon]);
      if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
      const r = markerRadius(it.frp);
      const meta = CLASS_META[it.class];
      const shape: Shape = this.raw ? "circle" : meta.shape;
      const x = p.x + offX;
      const y = p.y + offY;
      tracePath(ctx, shape, x, y, r);
      if (shape === "ring" && !this.raw) {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.95;
        ctx.stroke();
        ctx.lineWidth = 1;
      } else {
        ctx.globalAlpha = this.raw ? 0.7 : 0.92;
        ctx.fillStyle = this.raw ? RAW_COLOR : meta.color;
        ctx.fill();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = "rgba(0,0,0,0.65)";
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const hit: Hit = { x: p.x, y: p.y, r, item: it };
      this.hits.push(hit);
      if (it.id === this.selectedId) selected = hit;
    }

    if (selected) {
      const x = selected.x + offX;
      const y = selected.y + offY;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.beginPath();
      ctx.arc(x, y, selected.r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }
  }

  private hitAt(pt: L.Point): HotspotListItem | null {
    let best: Hit | null = null;
    let bestD = Infinity;
    // Later entries are painted on top, so ties resolve toward them (>=).
    for (const h of this.hits) {
      const d = Math.hypot(h.x - pt.x, h.y - pt.y);
      if (d <= h.r + 4 && d <= bestD) {
        best = h;
        bestD = d;
      }
    }
    return best ? best.item : null;
  }

  private handleClick(e: L.LeafletMouseEvent) {
    this.onPick(this.hitAt(e.containerPoint));
  }

  private handleHover(e: L.LeafletMouseEvent) {
    const map = (this as unknown as { _map?: L.Map })._map;
    if (!map) return;
    const pt = e.containerPoint;
    cancelAnimationFrame(this.hoverRaf);
    this.hoverRaf = requestAnimationFrame(() => {
      map.getContainer().style.cursor = this.hitAt(pt) ? "pointer" : "";
    });
  }
}
