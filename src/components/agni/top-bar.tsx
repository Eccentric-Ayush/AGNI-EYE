"use client";

import { useEffect, useState } from "react";
import { Flame, HelpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ThemeToggle } from "@/components/theme-toggle";
import type { PipelineStatus } from "@/hooks/use-agni";

function ago(h: number): string {
  if (h < 1) return "under 1 h ago";
  if (h < 48) return `${Math.round(h)} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function DataBadge({ status, loading, failed }: { status?: PipelineStatus; loading: boolean; failed: boolean }) {
  let tone = "border-border bg-secondary text-foreground";
  let dot = "bg-muted-foreground";
  let text = "Checking data…";
  const snap = status?.snapshot;
  if (snap) {
    if (snap.freshness === "live") {
      tone = "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
      dot = "bg-emerald-500 agni-pulse-dot";
      text = `LIVE · satellite data through ${snap.latestDate} · ingested ${ago(snap.ageHours)}`;
    } else {
      tone = "border-amber-500/60 bg-amber-500/10 text-amber-800 dark:text-amber-300";
      dot = "bg-amber-500";
      text = `ARCHIVED · data from ${snap.latestDate}, ingested ${ago(snap.ageHours)}`;
    }
  } else if (status && !snap) {
    tone = "border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-300";
    dot = "bg-red-500";
    text = "NO DATA · pipeline has not run";
  } else if (failed && !loading) {
    tone = "border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-300";
    dot = "bg-red-500";
    text = "Data status unavailable";
  }
  return (
    <div role="status" aria-live="polite" className={`flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {loading && !status ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />}
      <span>{text}</span>
    </div>
  );
}

export function TopBar({
  status,
  statusLoading,
  statusFailed,
  days,
  onDays,
  onHelp,
}: {
  status?: PipelineStatus;
  statusLoading: boolean;
  statusFailed: boolean;
  days: number;
  onDays: (d: number) => void;
  onHelp: () => void;
}) {
  const [utc, setUtc] = useState("");
  useEffect(() => {
    const tick = () => setUtc(new Date().toISOString().slice(11, 19) + " UTC");
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-[1100] border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-primary" aria-hidden />
          <div className="leading-tight">
            <h1 className="text-base font-bold tracking-wide">AGNI-EYE</h1>
            <p className="text-xs text-muted-foreground">Thermal-source triage · India</p>
          </div>
        </div>

        <ToggleGroup
          type="single"
          value={String(days)}
          onValueChange={(v) => v && onDays(Number(v))}
          variant="outline"
          size="sm"
          aria-label="Time window"
        >
          <ToggleGroupItem value="1" aria-label="Last 24 hours" className="px-3 text-xs">
            24 h
          </ToggleGroupItem>
          <ToggleGroupItem value="3" aria-label="Last 3 days" className="px-3 text-xs">
            3 d
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="min-w-0 flex-1" />

        <DataBadge status={status} loading={statusLoading} failed={statusFailed} />
        <span className="hidden font-mono text-xs text-muted-foreground sm:inline" aria-hidden>
          {utc}
        </span>
        <Button size="sm" variant="outline" onClick={onHelp} className="gap-1.5 text-xs" aria-label="How is a hotspot classified?">
          <HelpCircle className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">How it works</span>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
