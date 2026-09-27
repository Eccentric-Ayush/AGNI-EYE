"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Crosshair } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { FireFeature } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortKey = "frp" | "brightness" | "acqTime" | "latitude";

interface HotspotTableProps {
  features: FireFeature[];
  loading: boolean;
  onSelect: (f: FireFeature) => void;
  selectedKey: string | null;
}

function featKey(f: FireFeature): string {
  const p = f.properties;
  return `${p.satellite}|${p.acqDate}|${p.acqTime}|${p.latitude.toFixed(3)}|${p.longitude.toFixed(3)}`;
}

export function HotspotTable({ features, loading, onSelect, selectedKey }: HotspotTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("frp");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const arr = [...features];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "frp") cmp = a.properties.frp - b.properties.frp;
      else if (sortKey === "brightness") cmp = a.properties.brightness - b.properties.brightness;
      else if (sortKey === "acqTime") cmp = a.properties.acqTime.localeCompare(b.properties.acqTime);
      else if (sortKey === "latitude") cmp = a.properties.latitude - b.properties.latitude;
      return dir === "desc" ? -cmp : cmp;
    });
    return arr.slice(0, 200);
  }, [features, sortKey, dir]);

  const header = (key: SortKey, label: string, className?: string) => (
    <button
      onClick={() => {
        if (sortKey === key) setDir(dir === "desc" ? "asc" : "desc");
        else {
          setSortKey(key);
          setDir("desc");
        }
      }}
      className={cn(
        "flex items-center gap-1 font-semibold tracking-wider text-muted-foreground hover:text-orange-400",
        className
      )}
    >
      {label}
      {sortKey === key && (dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
    </button>
  );

  return (
    <Card className="border-border/60 bg-card/70 backdrop-blur">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-muted-foreground">
          <Crosshair className="h-3.5 w-3.5 text-orange-500" /> HOTSPOT REGISTER
          <span className="font-mono text-[10px] normal-case tracking-normal">
            (top {sorted.length} of {features.length.toLocaleString()} · click row to locate)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-64">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
              <tr className="border-b border-border/60 text-[10px]">
                <th className="px-3 py-2">#</th>
                <th className="px-2 py-2">{header("acqTime", "UTC TIME")}</th>
                <th className="px-2 py-2">{header("latitude", "LAT")}</th>
                <th className="px-2 py-2">LON</th>
                <th className="px-2 py-2">{header("brightness", "BRIGHT K")}</th>
                <th className="px-2 py-2">{header("frp", "FRP MW")}</th>
                <th className="px-2 py-2">PASS</th>
                <th className="px-2 py-2">SOURCE</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((f, i) => {
                const p = f.properties;
                const key = featKey(f);
                const sel = key === selectedKey;
                return (
                  <tr
                    key={`${key}-${i}`}
                    onClick={() => onSelect(f)}
                    className={cn(
                      "cursor-pointer border-b border-border/30 font-mono transition-colors hover:bg-orange-500/10",
                      sel && "bg-orange-500/15"
                    )}
                  >
                    <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      {p.acqTime}
                      <span className="ml-1 text-[9px] text-muted-foreground">{p.acqDate.slice(5)}</span>
                    </td>
                    <td className="px-2 py-1.5">{p.latitude.toFixed(3)}</td>
                    <td className="px-2 py-1.5">{p.longitude.toFixed(3)}</td>
                    <td className="px-2 py-1.5">{p.brightness.toFixed(1)}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={cn(
                          p.frp >= 100 ? "font-bold text-red-400" : p.frp >= 20 ? "text-orange-400" : "text-muted-foreground"
                        )}
                      >
                        {p.frp.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">{p.dayNight}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{SOURCE_LABELS[p.source] ?? p.source}</td>
                  </tr>
                );
              })}
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    No hotspots in the current window.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    Acquiring live satellite feed…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
