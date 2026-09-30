"use client";

import {
  AlertTriangle,
  Building2,
  ExternalLink,
  Factory,
  HelpCircle,
  History,
  Info,
  Mountain,
  Repeat,
  Satellite,
  Sprout,
  Trees,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, useEvidence } from "@/hooks/use-agni";
import { ClassGlyph } from "./class-glyph";
import { CLASS_META, CONFIDENCE_LABEL, LAND_COVER_LABEL, SITE_CATEGORY_LABEL, formatSubtype, formatTime } from "./class-meta";
import { EmptyState, ErrorState } from "./states";

const REASON_ICON: Record<string, LucideIcon> = {
  NEAR_FACILITY: Factory,
  RECURRENCE: Repeat,
  LOW_RECURRENCE: Repeat,
  HISTORY_SHORT: History,
  FRP_SPIKE: TrendingUp,
  NOT_ROUTINE: AlertTriangle,
  KNOWN_STATIC: Mountain,
  NO_MAPPED_FACILITY: Factory,
  CROPLAND: Sprout,
  AFTERNOON_PASS: Sprout,
  HIGH_FRP_FOR_CROP: TrendingUp,
  NATURAL_COVER: Trees,
  BUILT_UP: Building2,
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function EvidencePanel({ id, onOpenRules, onBack }: { id: string | null; onOpenRules: () => void; onBack: () => void }) {
  const { data, error, isLoading, isError, refetch } = useEvidence(id);

  if (!id) {
    return (
      <EmptyState
        title="Select a hotspot to see the evidence"
        hint="Click any marker on the map, a triage item, or a table row. You’ll see the class, how sure we are, and why."
      />
    );
  }
  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading evidence">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (isError || !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return notFound ? (
      <EmptyState
        title="This hotspot is no longer in the current snapshot"
        hint="The data was refreshed after you selected it. Pick another hotspot."
        action={{ label: "Back to queue", onClick: onBack }}
      />
    ) : (
      <ErrorState message={error?.message ?? "Unknown error"} onRetry={() => refetch()} compact />
    );
  }

  const h = data.hotspot;
  const meta = CLASS_META[h.class];
  const versionDrift = data.classifierVersion.snapshot !== data.classifierVersion.current;
  const recurrencePct = h.history.observedDays > 0 ? Math.round((h.history.daysActive / h.history.observedDays) * 100) : 0;
  const ratio = h.history.frpMedian > 0 ? h.frp / h.history.frpMedian : null;
  const sub = formatSubtype(h.subtype);

  return (
    <article className="space-y-4" aria-label={`Evidence for ${data.classLabel}`}>
      <header className="flex items-start gap-3">
        <ClassGlyph cls={h.class} size={30} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-base font-semibold leading-snug">{data.classLabel}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-xs font-medium">
              {CONFIDENCE_LABEL[h.confidence]}
            </Badge>
            {sub && (
              <Badge variant="secondary" className="text-xs font-normal">
                {sub}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{meta.definition}</p>
        </div>
      </header>

      {(versionDrift || !data.consistent) && (
        <Alert className="border-amber-500/50">
          <Info className="h-4 w-4" aria-hidden />
          <AlertDescription>
            {versionDrift
              ? `This snapshot was built with classifier ${data.classifierVersion.snapshot}; the running code is ${data.classifierVersion.current}. Reasons below are recomputed and may differ slightly.`
              : "The reasons below were recomputed and no longer exactly reproduce the stored label. Rebuild the snapshot to refresh."}
          </AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="why-heading" className="space-y-2">
        <h4 id="why-heading" className="text-sm font-semibold">
          Why this label
        </h4>
        <ul className="space-y-2">
          {data.reasons.map((r, i) => {
            const Icon = REASON_ICON[r.code] ?? Info;
            return (
              <li key={`${r.code}-${i}`} className="flex items-start gap-2.5 text-sm">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>{r.text}</span>
              </li>
            );
          })}
        </ul>
        <Button variant="link" size="sm" className="h-auto gap-1 p-0 text-xs" onClick={onOpenRules}>
          <HelpCircle className="h-3.5 w-3.5" aria-hidden /> How is this classified?
        </Button>
      </section>

      <section aria-labelledby="facts-heading" className="space-y-3">
        <h4 id="facts-heading" className="text-sm font-semibold">
          The evidence
        </h4>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Fact label="Nearest facility">
            {h.site ? (
              <>
                <span className="font-medium">{h.site.name ?? "Unnamed"}</span>
                <br />
                <span className="text-muted-foreground">
                  {SITE_CATEGORY_LABEL[h.site.category] ?? h.site.category} · {h.site.distanceM < 1 ? "inside boundary" : `${h.site.distanceM} m`}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">None within range</span>
            )}
          </Fact>
          {data.nearbyFacilities && data.nearbyFacilities.length > 0 && (
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Mapped facilities within 2 km</dt>
              <dd className="mt-1 space-y-0.5 text-sm">
                {data.nearbyFacilities.map((f, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {f.name ?? "Unnamed"} <span className="text-muted-foreground">· {SITE_CATEGORY_LABEL[f.category] ?? f.category}{f.kind === "point" ? " (point on map)" : ""}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{f.distanceM < 1 ? "inside" : `${f.distanceM} m`}</span>
                  </div>
                ))}
                {!h.site && (
                  <p className="pt-1 text-xs text-muted-foreground">
                    None of these is inside the match distance, so none was used for the label. Large plants that OSM maps only as a point can sit this far from their furnaces.
                  </p>
                )}
              </dd>
            </div>
          )}
          <Fact label="Land cover">{h.landCover ? (LAND_COVER_LABEL[h.landCover] ?? h.landCover) : <span className="text-muted-foreground">Unavailable</span>}</Fact>
          <Fact label="Fire power (FRP)">
            <span className="font-mono">{h.frp.toFixed(1)} MW</span>
            {ratio !== null ? (
              <span className="block text-xs text-muted-foreground">
                {ratio.toFixed(1)}× this place’s median ({h.history.frpMedian.toFixed(1)} MW)
              </span>
            ) : (
              <span className="block text-xs text-muted-foreground">No baseline yet</span>
            )}
          </Fact>
          <Fact label="Brightness">
            <span className="font-mono">{h.brightness.toFixed(0)} K</span>
            {h.brightT31 !== null && <span className="block font-mono text-xs text-muted-foreground">T31 {h.brightT31.toFixed(0)} K</span>}
          </Fact>
        </dl>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-xs text-muted-foreground">Recurrence (prior days active)</span>
            <span className="font-mono text-xs">
              {h.history.daysActive} of {h.history.observedDays} days
            </span>
          </div>
          <Progress value={recurrencePct} aria-label={`Active on ${h.history.daysActive} of ${h.history.observedDays} observed days`} className="h-2" />
          {h.history.firstSeen && (
            <p className="text-xs text-muted-foreground">
              First seen {h.history.firstSeen} · last seen {h.history.lastSeen}
            </p>
          )}
          {h.history.observedDays < 14 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">Only {h.history.observedDays} days of history — persistence is uncertain.</p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Fact label="Acquired">
            <span className="font-mono text-xs">{formatTime(h.acqDate, h.acqTime)}</span>
            <span className="block text-xs text-muted-foreground">{h.dayNight === "N" ? "Night pass" : "Day pass"}</span>
          </Fact>
          <Fact label="Satellite">
            <span className="inline-flex items-center gap-1.5">
              <Satellite className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              VIIRS {h.source.replace("viirs_", "").toUpperCase()}
            </span>
          </Fact>
          <Fact label="Coordinates">
            <span className="font-mono text-xs">
              {h.lat.toFixed(4)}°N, {h.lon.toFixed(4)}°E
            </span>
          </Fact>
        </dl>
      </section>

      <section aria-labelledby="verify-heading" className="space-y-2">
        <h4 id="verify-heading" className="text-sm font-semibold">
          Verify independently
        </h4>
        <div className="flex flex-wrap gap-2">
          {[
            { href: data.links.sentinelHub, label: "Sentinel-2 imagery" },
            { href: data.links.firms, label: "NASA FIRMS" },
            { href: data.links.osm, label: "OpenStreetMap" },
          ].map((l) => (
            <Button key={l.label} asChild size="sm" variant="outline" className="gap-1.5 text-xs">
              <a href={l.href} target="_blank" rel="noreferrer noopener">
                {l.label} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </Button>
          ))}
        </div>
      </section>
    </article>
  );
}
