"use client";

import { CalendarDays, Crosshair, Filter, Layers3, Moon, Sun } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Bbox, GibsSource } from "@/lib/types";
import { ALL_SOURCES, REGION_PRESETS, SOURCE_LABELS } from "@/lib/types";

export interface Filters {
  regionName: string;
  bbox: Bbox;
  date: string;
  days: number;
  sources: GibsSource[]; // empty = all
  dayNight: "all" | "D" | "N";
  minFrp: number;
}

interface FiltersPanelProps {
  filters: Filters;
  onChange: (f: Partial<Filters>) => void;
  todayIso: string;
  onUseMapView: () => void;
  mapBbox: Bbox | null;
}

export function FiltersPanel({ filters, onChange, todayIso, onUseMapView, mapBbox }: FiltersPanelProps) {
  const toggleSource = (s: GibsSource) => {
    const active = filters.sources.length === 0 ? ALL_SOURCES : filters.sources;
    const next = active.includes(s) ? active.filter((x) => x !== s) : [...active, s];
    onChange({ sources: next.length === ALL_SOURCES.length ? [] : next });
  };

  const isSourceActive = (s: GibsSource) =>
    filters.sources.length === 0 || filters.sources.includes(s);

  return (
    <Card className="border-border/60 bg-card/70 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-muted-foreground">
          <Filter className="h-3.5 w-3.5 text-orange-500" /> MISSION FILTERS
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Region presets */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider text-muted-foreground">REGION</span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-2 text-[10px]"
              onClick={onUseMapView}
              disabled={!mapBbox}
              title="Use the current map viewport as the query region"
            >
              <Crosshair className="h-3 w-3" /> USE MAP VIEW
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {REGION_PRESETS.map((r) => (
              <button
                key={r.name}
                onClick={() => onChange({ regionName: r.name, bbox: r.bbox })}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-left text-[11px] leading-tight transition-colors",
                  filters.regionName === r.name
                    ? "border-orange-500/60 bg-orange-500/15 text-orange-400"
                    : "border-border/50 bg-secondary/30 text-muted-foreground hover:border-orange-500/40 hover:text-foreground"
                )}
              >
                {r.name}
              </button>
            ))}
          </div>
          {filters.regionName === "Map View" && mapBbox && (
            <p className="font-mono text-[10px] text-muted-foreground">
              MAP VIEW: [{mapBbox.west.toFixed(1)}, {mapBbox.south.toFixed(1)}] → [{mapBbox.east.toFixed(1)},{" "}
              {mapBbox.north.toFixed(1)}]
            </p>
          )}
        </div>

        {/* Date + days */}
        <div className="space-y-2">
          <span className="text-[11px] font-semibold tracking-wider text-muted-foreground">TIME WINDOW</span>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <CalendarDays className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="date"
                value={filters.date}
                max={todayIso}
                min="2000-11-01"
                onChange={(e) => onChange({ date: e.target.value })}
                className="h-8 w-full rounded-md border border-border/50 bg-secondary/30 pl-7 pr-2 font-mono text-[11px] text-foreground outline-none focus:border-orange-500/60"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Days back:</span>
            <Slider
              value={[filters.days]}
              min={1}
              max={7}
              step={1}
              onValueChange={([v]) => onChange({ days: v })}
              className="flex-1"
            />
            <span className="w-8 text-right font-mono text-[11px] text-orange-400">{filters.days}d</span>
          </div>
        </div>

        {/* Satellite sources */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[11px] font-semibold tracking-wider text-muted-foreground">
              <Layers3 className="h-3 w-3" /> SATELLITE SOURCES
            </span>
            <button
              onClick={() => onChange({ sources: [] })}
              className="text-[10px] text-orange-400 hover:underline"
            >
              ALL
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {ALL_SOURCES.map((s) => (
              <button
                key={s}
                onClick={() => toggleSource(s)}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors",
                  isSourceActive(s)
                    ? "border-amber-500/60 bg-amber-500/10 text-foreground"
                    : "border-border/50 bg-secondary/20 text-muted-foreground/60 line-through"
                )}
              >
                {SOURCE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Day/night */}
        <div className="space-y-2">
          <span className="text-[11px] font-semibold tracking-wider text-muted-foreground">ORBIT PASS</span>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { v: "all", label: "All", icon: null },
                { v: "D", label: "Day", icon: Sun },
                { v: "N", label: "Night", icon: Moon },
              ] as const
            ).map(({ v, label, icon: Icon }) => (
              <button
                key={v}
                onClick={() => onChange({ dayNight: v })}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[11px] transition-colors",
                  filters.dayNight === v
                    ? "border-orange-500/60 bg-orange-500/15 text-orange-400"
                    : "border-border/50 bg-secondary/30 text-muted-foreground hover:text-foreground"
                )}
              >
                {Icon && <Icon className="h-3 w-3" />}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Min FRP */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider text-muted-foreground">
              MIN FIRE RADIATIVE POWER
            </span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {filters.minFrp} MW
            </Badge>
          </div>
          <Slider
            value={[filters.minFrp]}
            min={0}
            max={300}
            step={5}
            onValueChange={([v]) => onChange({ minFrp: v })}
          />
        </div>

        <ScrollArea className="h-0" />
      </CardContent>
    </Card>
  );
}
