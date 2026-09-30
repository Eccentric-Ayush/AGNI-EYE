"use client";

import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { HotspotsResponse } from "@/hooks/use-agni";

function Stat({
  label,
  value,
  sub,
  tone,
  onClick,
  active,
  ariaLabel,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "danger";
  onClick?: () => void;
  active?: boolean;
  ariaLabel?: string;
}) {
  const body = (
    <>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`text-3xl font-bold leading-none tabular-nums ${tone === "danger" ? "text-red-500" : ""}`}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </>
  );
  const cls = `flex min-w-[8.5rem] flex-1 flex-col items-start gap-1.5 rounded-lg border px-4 py-3 text-left ${
    active ? "border-red-500 bg-red-500/10" : "border-border bg-card"
  }`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} aria-label={ariaLabel} className={`${cls} transition-colors hover:border-foreground/40`}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** Headline: Raw hotspots → Classified → Needs attention (the noise-reduction story, MVP M9). */
export function HeadlineStrip({
  totals,
  loading,
  anomalyOnly,
  onToggleAnomalies,
  windowLabel,
}: {
  totals?: HotspotsResponse["totals"];
  loading: boolean;
  anomalyOnly: boolean;
  onToggleAnomalies: () => void;
  windowLabel: string;
}) {
  if (!totals) {
    return loading ? <Skeleton className="h-[5.5rem] w-full rounded-lg" /> : null;
  }
  const share = totals.raw ? Math.round((totals.classified / totals.raw) * 100) : 0;
  return (
    <section aria-label={`Noise reduction, ${windowLabel}`} className="flex flex-wrap items-stretch gap-2">
      <Stat label={`Raw hotspots · ${windowLabel}`} value={totals.raw.toLocaleString()} sub="every NASA VIIRS detection in India" />
      <div className="flex items-center text-muted-foreground" aria-hidden>
        <ArrowRight className="h-5 w-5" />
      </div>
      <Stat label="Classified" value={totals.classified.toLocaleString()} sub={`${share}% received a class — a coverage figure, not accuracy`} />
      <div className="flex items-center text-muted-foreground" aria-hidden>
        <ArrowRight className="h-5 w-5" />
      </div>
      <Stat
        label="Needs attention"
        value={totals.needsAttention.toLocaleString()}
        sub={anomalyOnly ? "showing only these — click to clear" : "medium/high-confidence industrial anomalies — click to show anomalies on the map"}
        tone="danger"
        active={anomalyOnly}
        onClick={onToggleAnomalies}
        ariaLabel={`${totals.needsAttention} medium or high confidence items need attention. ${anomalyOnly ? "Clear the filter" : "Show only industrial anomalies on the map"}`}
      />
    </section>
  );
}
