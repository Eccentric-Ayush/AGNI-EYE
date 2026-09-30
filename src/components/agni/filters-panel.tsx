"use client";

import { useState } from "react";
import { AlertTriangle, SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ClassId } from "@/lib/classify/types";
import type { HotspotsResponse, PipelineStatus } from "@/hooks/use-agni";
import { ClassGlyph } from "./class-glyph";
import { CLASS_META, ORDERED_CLASSES } from "./class-meta";
import type { IndustrialInfo } from "./agni-map";

export type ViewMode = "classified" | "raw";

interface Props {
  mode: ViewMode;
  onMode: (m: ViewMode) => void;
  activeClasses: Set<ClassId>;
  onToggleClass: (c: ClassId) => void;
  onAllClasses: () => void;
  byClass?: HotspotsResponse["totals"]["byClass"];
  showIndustrial: boolean;
  onShowIndustrial: (v: boolean) => void;
  showSources: boolean;
  onShowSources: (v: boolean) => void;
  industrialInfo: IndustrialInfo;
  industrialLayer?: PipelineStatus["industrialLayer"];
  minFrp: number;
  onMinFrp: (v: number) => void;
  sourceCount?: number;
}

export function FiltersPanel(p: Props) {
  // Draft value while dragging; committed (and refetched) on release.
  const [draft, setDraft] = useState<number | null>(null);
  const frp = draft ?? p.minFrp;
  const isRaw = p.mode === "raw";
  const allOn = p.activeClasses.size === ORDERED_CLASSES.length;
  const layer = p.industrialLayer;

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-semibold tracking-wide">VIEW &amp; FILTERS</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 px-4">
        <div className="space-y-2">
          <p id="mode-label" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Map mode
          </p>
          <ToggleGroup
            type="single"
            value={p.mode}
            onValueChange={(v) => v && p.onMode(v as ViewMode)}
            variant="outline"
            className="w-full"
            aria-labelledby="mode-label"
          >
            <ToggleGroupItem value="raw" className="flex-1 text-xs">
              Raw (before)
            </ToggleGroupItem>
            <ToggleGroupItem value="classified" className="flex-1 text-xs">
              Classified (after)
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Classes</p>
            {!allOn && !isRaw && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={p.onAllClasses}>
                Show all
              </Button>
            )}
          </div>
          <ul className="space-y-1.5">
            {ORDERED_CLASSES.map((c) => {
              const on = p.activeClasses.has(c);
              const count = p.byClass?.[c];
              return (
                <li key={c}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={isRaw}
                    onClick={() => p.onToggleClass(c)}
                    title={CLASS_META[c].definition}
                    className={`flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      on && !isRaw ? "border-foreground/30 bg-secondary" : "border-border bg-transparent text-muted-foreground"
                    } hover:border-foreground/50`}
                  >
                    <ClassGlyph cls={c} size={18} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{CLASS_META[c].label}</span>
                    <span className="font-mono text-xs tabular-nums">{count === undefined ? "–" : count.toLocaleString()}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {isRaw ? (
            <p className="text-xs text-muted-foreground">Class filters apply in Classified view.</p>
          ) : (
            <p className="text-xs text-muted-foreground">Colour and shape both identify the class. Counts are for the selected window.</p>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Layers</p>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Industrial facilities (OSM)</span>
            <Switch checked={p.showIndustrial} onCheckedChange={p.onShowIndustrial} disabled={layer ? !layer.available : false} aria-label="Show industrial facilities overlay" />
          </label>
          {p.showIndustrial && <IndustrialNote info={p.industrialInfo} />}
          {layer && !layer.available && <p className="text-xs text-muted-foreground">Layer not built yet — run npm run build:industrial.</p>}
          {layer?.available && layer.coverage && !layer.coverage.complete && (
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Partial layer: {layer.coverage.chunksUsed} of {layer.coverage.chunksTotal} map areas downloaded, so some facilities aren’t matched yet.
              </span>
            </p>
          )}
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              Persistent sources
              {p.sourceCount !== undefined && <span className="ml-1 font-mono text-xs text-muted-foreground">({p.sourceCount})</span>}
            </span>
            <Switch checked={p.showSources} onCheckedChange={p.onShowSources} aria-label="Show persistent thermal sources as dashed rings" />
          </label>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between text-xs">
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> Advanced filters
              </span>
              <span className="font-mono text-muted-foreground">{p.minFrp > 0 ? `FRP ≥ ${p.minFrp} MW` : "none"}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-3" align="start">
            <div className="flex items-center justify-between text-sm">
              <label htmlFor="min-frp">Minimum fire power</label>
              <span className="font-mono text-xs">{frp} MW</span>
            </div>
            <Slider id="min-frp" min={0} max={100} step={5} value={[frp]} onValueChange={([v]) => setDraft(v)} onValueCommit={([v]) => { p.onMinFrp(v); setDraft(null); }} aria-label="Minimum fire radiative power in megawatts" />
            <p className="text-xs text-muted-foreground">Hides weaker detections. Counts above update to match.</p>
          </PopoverContent>
        </Popover>
      </CardContent>
    </Card>
  );
}

function IndustrialNote({ info }: { info: IndustrialInfo }) {
  let text = "";
  if (info.state === "zoom") text = "Zoom in to see facilities (from zoom level 7).";
  else if (info.state === "loading") text = "Loading facilities…";
  else if (info.state === "error") text = `Couldn’t load facilities: ${info.message ?? "error"}`;
  else if (info.state === "ok")
    text = info.truncated
      ? `Showing first 3,000 of ${info.matched?.toLocaleString()} facilities in view — zoom in for the rest.`
      : `${info.matched?.toLocaleString()} facilities in view.`;
  if (!text) return null;
  return (
    <p className="text-xs text-muted-foreground" aria-live="polite">
      {text}
    </p>
  );
}
