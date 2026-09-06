"use client";

import { useEffect, useState } from "react";
import { Flame, RefreshCw, Settings2, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SourcesStatusPayload } from "@/lib/types";

interface TopBarProps {
  status: SourcesStatusPayload | undefined;
  statusLoading: boolean;
  generatedAt: string | null;
  autoRefresh: boolean;
  intervalMs: number;
  onToggleAuto: (v: boolean) => void;
  onIntervalChange: (ms: number) => void;
  onManualRefresh: () => void;
  refreshing: boolean;
  onOpenSettings: () => void;
}

function StatusChip({
  label,
  ok,
  detail,
  loading,
  tone = "green",
}: {
  label: string;
  ok: boolean;
  detail?: string;
  loading: boolean;
  tone?: "green" | "amber";
}) {
  const color = ok ? (tone === "amber" ? "bg-amber-400" : "bg-emerald-400") : "bg-red-500";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex cursor-default items-center gap-1.5 rounded-md border border-border/50 bg-secondary/40 px-2 py-1 text-[11px] font-medium tracking-wide">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${color} ${ok ? "agni-pulse-dot" : ""}`}
            />
            {loading ? "CHECKING…" : label}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[280px] text-xs">
          <p className="font-semibold">{label}</p>
          <p className="text-muted-foreground">{detail ?? (ok ? "Live" : "Unavailable")}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function TopBar({
  status,
  statusLoading,
  generatedAt,
  autoRefresh,
  intervalMs,
  onToggleAuto,
  onIntervalChange,
  onManualRefresh,
  refreshing,
  onOpenSettings,
}: TopBarProps) {
  const [utc, setUtc] = useState<string>("");

  useEffect(() => {
    const tick = () => setUtc(new Date().toISOString().slice(11, 19) + " UTC");
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const s = status?.sources;

  return (
    <header className="agni-grid-bg sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-4">
        {/* Branding */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-orange-500/40 bg-gradient-to-br from-orange-500/20 to-red-600/10">
            <Flame className="h-5 w-5 text-orange-500" />
            <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
              <span className="agni-pulse-dot absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-bold tracking-[0.18em] text-foreground">
              AGNI<span className="text-orange-500">·</span>EYE
              <span className="ml-1.5 font-mono text-[10px] font-medium tracking-[0.3em] text-muted-foreground">
                COMMAND
              </span>
            </h1>
            <p className="font-mono text-[10px] tracking-wider text-muted-foreground">
              LIVE WILDFIRE INTELLIGENCE · <span className="text-amber-400">{utc}</span>
            </p>
          </div>
        </div>

        <div className="mx-1 hidden h-8 w-px bg-border/60 lg:block" />

        {/* Live data source status */}
        <div className="hidden flex-wrap items-center gap-1.5 lg:flex">
          {s && (
            <>
              <StatusChip
                label="GIBS HOTSPOTS"
                ok={s.gibsHotspots.ok}
                detail={`${s.gibsHotspots.detail} · ${s.gibsHotspots.latencyMs}ms · live vector tiles, no key`}
                loading={statusLoading}
              />
              <StatusChip
                label="EONET EVENTS"
                ok={s.eonet.ok}
                detail={s.eonet.detail}
                loading={statusLoading}
                tone="amber"
              />
              <StatusChip
                label="NASA IMAGERY"
                ok={s.gibsImagery.ok}
                detail={s.gibsImagery.detail}
                loading={statusLoading}
                tone="amber"
              />
              <StatusChip
                label={`FIRMS API${s.firmsApi.configured ? "" : " (NO KEY)"}`}
                ok={s.firmsApi.ok}
                detail={s.firmsApi.detail}
                loading={statusLoading}
              />
            </>
          )}
          {!s && !statusLoading && (
            <Badge variant="outline" className="gap-1.5 text-[11px]">
              <Radio className="h-3 w-3" /> SOURCE STATUS UNAVAILABLE
            </Badge>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Auto refresh controls */}
          <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-secondary/40 px-2 py-1">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground">AUTO</span>
            <button
              onClick={() => onToggleAuto(!autoRefresh)}
              className={`relative h-4 w-8 rounded-full transition-colors ${autoRefresh ? "bg-orange-500" : "bg-muted-foreground/30"}`}
              aria-label="Toggle auto refresh"
            >
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${autoRefresh ? "left-[18px]" : "left-0.5"}`}
              />
            </button>
            <select
              value={intervalMs}
              onChange={(e) => onIntervalChange(Number(e.target.value))}
              className="bg-transparent font-mono text-[10px] text-foreground outline-none"
              aria-label="Refresh interval"
            >
              <option value={60000}>1m</option>
              <option value={300000}>5m</option>
              <option value={900000}>15m</option>
            </select>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={onManualRefresh}
            className="h-8 gap-1.5 border-border/60 text-xs"
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={onOpenSettings}
            className="h-8 gap-1.5 border-border/60 text-xs"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </Button>
        </div>
      </div>

      {generatedAt && (
        <div className="border-t border-border/40 px-3 py-0.5 sm:px-4">
          <span className="font-mono text-[10px] text-muted-foreground">
            LAST FEED SYNC: {new Date(generatedAt).toISOString().slice(0, 19).replace("T", " ")} UTC
          </span>
        </div>
      )}
    </header>
  );
}
