"use client";

import { Flame, Gauge, Moon, Satellite, Sun, Thermometer } from "lucide-react";
import type { FiresStats } from "@/lib/types";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "orange",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  tone?: "orange" | "red" | "amber" | "cyan";
}) {
  const tones = {
    orange: "text-orange-500 from-orange-500/15",
    red: "text-red-500 from-red-500/15",
    amber: "text-amber-400 from-amber-400/15",
    cyan: "text-cyan-400 from-cyan-400/15",
  } as const;
  return (
    <div className="relative overflow-hidden rounded-lg border border-border/60 bg-card/70 p-3 backdrop-blur">
      <div
        className={`pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full bg-gradient-to-br ${tones[tone]} to-transparent`}
      />
      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.15em] text-muted-foreground">
        <Icon className={`h-3 w-3 ${tones[tone].split(" ")[0]}`} />
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function StatsCards({ stats, loading }: { stats: FiresStats | undefined; loading: boolean }) {
  if (loading && !stats) {
    return (
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[76px] animate-pulse rounded-lg border border-border/40 bg-secondary/30" />
        ))}
      </div>
    );
  }
  if (!stats) return null;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      <StatCard
        icon={Flame}
        label="LIVE HOTSPOTS"
        value={stats.total.toLocaleString()}
        sub="active detections in view"
      />
      <StatCard
        icon={Gauge}
        label="MAX FRP"
        value={`${stats.maxFrp.toLocaleString()}`}
        sub={`MW · avg ${stats.avgFrp} MW`}
        tone="red"
      />
      <StatCard
        icon={Thermometer}
        label="PEAK BRIGHTNESS"
        value={`${stats.maxBrightness.toLocaleString()}`}
        sub={`K · avg ${stats.avgBrightness} K`}
        tone="amber"
      />
      <StatCard
        icon={Flame}
        label="HIGH ENERGY"
        value={stats.highFrpCount.toLocaleString()}
        sub="hotspots ≥ 100 MW FRP"
        tone="red"
      />
      <StatCard icon={Sun} label="DAY PASS" value={stats.byDayNight.D.toLocaleString()} sub="detections" />
      <StatCard
        icon={Moon}
        label="NIGHT PASS"
        value={stats.byDayNight.N.toLocaleString()}
        sub="detections"
        tone="cyan"
      />
    </div>
  );
}
