"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FiresStats } from "@/lib/types";
import { SOURCE_LABELS, type GibsSource } from "@/lib/types";

const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 11,
  color: "var(--popover-foreground)",
} as const;

const axisTick = { fontSize: 9, fill: "var(--muted-foreground)" } as const;
const gridStroke = "var(--border)";

const SOURCE_COLORS: Record<string, string> = {
  viirs_snpp: "#f97316",
  viirs_noaa20: "#f59e0b",
  viirs_noaa21: "#fbbf24",
  modis_terra: "#ef4444",
  modis_aqua: "#fb7185",
  modis_combined: "#e879f9",
};

export function AnalyticsCharts({ stats }: { stats: FiresStats | undefined }) {
  if (!stats || stats.total === 0) {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-border/60 bg-card/70 md:col-span-3">
          <CardContent className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            No detections in the current window — try another region or date.
          </CardContent>
        </Card>
      </div>
    );
  }

  const sourceData = Object.entries(stats.bySource)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: SOURCE_LABELS[k as GibsSource] ?? k, value: v, key: k }));
  const dnData = [
    { name: "Day", value: stats.byDayNight.D, fill: "#f59e0b" },
    { name: "Night", value: stats.byDayNight.N, fill: "#22d3ee" },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {/* Hourly */}
      <Card className="border-border/60 bg-card/70">
        <CardHeader className="pb-1">
          <CardTitle className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">
            DETECTIONS BY ACQ HOUR (UTC)
          </CardTitle>
        </CardHeader>
        <CardContent className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.byHour} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.65} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="hour"
                tick={axisTick}
                interval={3}
                tickLine={false}
                axisLine={{ stroke: gridStroke }}
              />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#f97316" }} />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#f97316"
                strokeWidth={1.5}
                fill="url(#hourGrad)"
                name="Detections"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* FRP buckets */}
      <Card className="border-border/60 bg-card/70">
        <CardHeader className="pb-1">
          <CardTitle className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">
            FIRE RADIATIVE POWER (MW)
          </CardTitle>
        </CardHeader>
        <CardContent className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.frpBuckets} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="bucket"
                tick={axisTick}
                tickLine={false}
                axisLine={{ stroke: gridStroke }}
              />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "oklch(0.5 0 0 / 8%)" }} />
              <Bar dataKey="count" name="Hotspots" radius={[3, 3, 0, 0]}>
                {stats.frpBuckets.map((_, i) => (
                  <Cell
                    key={i}
                    fill={["#facc15", "#fbbf24", "#f97316", "#ea580c", "#dc2626"][i]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Day/night + source mix */}
      <Card className="border-border/60 bg-card/70">
        <CardHeader className="pb-1">
          <CardTitle className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">
            ORBIT PASS & SOURCE MIX
          </CardTitle>
        </CardHeader>
        <CardContent className="grid h-40 grid-cols-2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={dnData} dataKey="value" nameKey="name" innerRadius={26} outerRadius={44} paddingAngle={3} stroke="none">
                {dnData.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 overflow-y-auto py-1 pr-1">
            {sourceData.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5 text-[10px]">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: SOURCE_COLORS[s.key] ?? "#f97316" }}
                />
                <span className="truncate text-muted-foreground">{s.name}</span>
                <span className="ml-auto font-mono text-foreground">{s.value.toLocaleString()}</span>
              </div>
            ))}
            {sourceData.length === 0 && (
              <p className="pt-6 text-[10px] text-muted-foreground">No source data.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
