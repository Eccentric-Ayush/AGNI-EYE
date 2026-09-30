"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, useSites, useValidation, type HotspotsResponse } from "@/hooks/use-agni";
import type { HotspotListItem, PersistentSource } from "@/lib/pipeline/types";
import { CLASS_LABELS, type ClassId } from "@/lib/classify/types";
import { ClassGlyph } from "./class-glyph";
import { CLASS_META, CONFIDENCE_LABEL, ORDERED_CLASSES, SITE_CATEGORY_LABEL, formatSubtype } from "./class-meta";
import { EmptyState, ErrorState, NoSnapshot } from "./states";

function rowKeys(fn: () => void) {
  return {
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fn();
      }
    },
  };
}

const rowCls = "cursor-pointer hover:bg-secondary/60 focus-visible:bg-secondary focus-visible:outline-2 focus-visible:outline-ring";

function ClassCell({ cls }: { cls: ClassId }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <ClassGlyph cls={cls} size={16} />
      {CLASS_LABELS[cls]}
    </span>
  );
}

/* ---------------------------------------------------------------- Register */

type SortKey = "name" | "type" | "class" | "days" | "seen" | "frp";
type SortState = { key: SortKey; dir: 1 | -1 };

function SortHead({
  k,
  sort,
  onSort,
  children,
  className,
}: {
  k: SortKey;
  sort: SortState;
  onSort: (k: SortKey) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TableHead className={className} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex items-center gap-1 font-medium hover:text-foreground" onClick={() => onSort(k)}>
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden />)}
      </button>
    </TableHead>
  );
}

function sourceName(s: PersistentSource): string {
  return s.siteName ?? (s.subtype === "unmapped_persistent" ? "Unmapped persistent source" : (formatSubtype(s.subtype) ?? "Persistent source"));
}

function RegisterTab({ onFly }: { onFly: (lat: number, lon: number) => void }) {
  const { data, error, isLoading, isError, refetch } = useSites();
  const [sort, setSort] = useState<SortState>({ key: "days", dir: -1 });
  const onSort = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, dir: (s.dir * -1) as 1 | -1 } : { key: k, dir: k === "name" || k === "type" || k === "class" ? 1 : -1 }));

  const rows = useMemo(() => {
    const list = [...(data?.sources ?? [])];
    const val = (s: PersistentSource): string | number => {
      switch (sort.key) {
        case "name":
          return sourceName(s).toLowerCase();
        case "type":
          return (s.siteCategory ?? s.subtype ?? "").toLowerCase();
        case "class":
          return s.class;
        case "days":
          return s.daysActive;
        case "seen":
          return s.lastSeen;
        case "frp":
          return s.frpMedian;
      }
    };
    list.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
    return list;
  }, [data, sort]);

  if (isLoading) return <Skeleton className="h-48 w-full" aria-busy="true" />;
  if (isError && !data)
    return error instanceof ApiError && error.status === 503 ? <NoSnapshot /> : <ErrorState message={error?.message ?? "Unknown error"} onRetry={() => refetch()} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Places that keep showing heat (active on at least 6 days in the last 30) — the standing register of persistent thermal sources.
          {data && <span className="ml-1 font-medium text-foreground">{data.count} sources.</span>}
        </p>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs">
            <a href="/api/sites?format=csv" download>
              <Download className="h-3.5 w-3.5" aria-hidden /> Export CSV
            </a>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs">
            <a href="/api/sites?format=geojson" download>
              <Download className="h-3.5 w-3.5" aria-hidden /> Export GeoJSON
            </a>
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No persistent sources yet" hint="A place needs to be active on several days before it’s registered. More history will fill this in." />
      ) : (
        <div className="max-h-[420px] overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <SortHead k="name" sort={sort} onSort={onSort}>Source</SortHead>
                <SortHead k="type" sort={sort} onSort={onSort}>Type</SortHead>
                <SortHead k="class" sort={sort} onSort={onSort}>Class</SortHead>
                <SortHead k="days" sort={sort} onSort={onSort} className="text-right">
                  Days active
                </SortHead>
                <SortHead k="seen" sort={sort} onSort={onSort}>First – last seen</SortHead>
                <SortHead k="frp" sort={sort} onSort={onSort} className="text-right">
                  Median FRP
                </SortHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 500).map((s) => (
                <TableRow key={s.id} className={rowCls} aria-label={`${sourceName(s)}. Show on map.`} {...rowKeys(() => onFly(s.lat, s.lon))}>
                  <TableCell className="max-w-[16rem] truncate font-medium">{sourceName(s)}</TableCell>
                  <TableCell className="text-muted-foreground">{s.siteCategory ? (SITE_CATEGORY_LABEL[s.siteCategory] ?? s.siteCategory) : (formatSubtype(s.subtype) ?? "—")}</TableCell>
                  <TableCell>
                    <ClassCell cls={s.class} />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {s.daysActive}/{s.windowDays}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {s.firstSeen} – {s.lastSeen}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{s.frpMedian.toFixed(1)} MW</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Hotspots */

function HotspotsTab({ features, onSelect }: { features: HotspotListItem[]; onSelect: (h: HotspotListItem) => void }) {
  const top = features.slice(0, 200);
  if (top.length === 0) return <EmptyState title="No hotspots match the current filters" hint="Turn on more classes or lower the minimum fire power." />;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Top {top.length} of {features.length.toLocaleString()} by fire power, for the current filters.
      </p>
      <div className="max-h-[420px] overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>Class</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead className="text-right">FRP</TableHead>
              <TableHead>Facility</TableHead>
              <TableHead>Acquired (UTC)</TableHead>
              <TableHead>Location</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top.map((h) => (
              <TableRow key={h.id} className={rowCls} aria-label={`${CLASS_LABELS[h.class]}, ${h.frp.toFixed(1)} megawatts. Open evidence.`} {...rowKeys(() => onSelect(h))}>
                <TableCell>
                  <ClassCell cls={h.class} />
                </TableCell>
                <TableCell className="text-muted-foreground">{CONFIDENCE_LABEL[h.confidence].replace(" confidence", "")}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{h.frp.toFixed(1)} MW</TableCell>
                <TableCell className="max-w-[14rem] truncate">{h.siteName ?? (h.siteCategory ? (SITE_CATEGORY_LABEL[h.siteCategory] ?? h.siteCategory) : "—")}</TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs">
                  {h.acqDate} {h.acqTime.slice(0, 2)}:{h.acqTime.slice(2)}
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs">
                  {h.lat.toFixed(3)}, {h.lon.toFixed(3)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Validation */

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);

function ValidationTab() {
  const { data, error, isLoading, isError, refetch } = useValidation();
  if (isLoading) return <Skeleton className="h-40 w-full" aria-busy="true" />;
  if (isError || !data)
    return <ErrorState message={error?.message ?? "Validation results could not be loaded."} onRetry={() => refetch()} />;

  if (!data.available) {
    return (
      <div className="space-y-2 rounded-md border border-dashed p-4 text-sm">
        <p className="font-medium">No validation results yet</p>
        <p className="text-muted-foreground">
          {data.message ??
            "AGNI-EYE reports accuracy only from an evaluation run against externally verified sites. None has been run, so no accuracy is claimed."}
        </p>
        <p className="text-muted-foreground">
          This tab will show per-class precision and recall, a confusion matrix, and every verified site — including the ones the classifier got wrong.
        </p>
      </div>
    );
  }

  const labels = data.confusion?.labels ?? [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-sm">
          <span className="text-3xl font-bold tabular-nums">{pct(data.accuracy)}</span> <span className="text-muted-foreground">overall accuracy on</span>{" "}
          <span className="font-semibold">{data.n}</span> <span className="text-muted-foreground">verified sites</span>
        </p>
        {data.generatedAt && <p className="text-xs text-muted-foreground">Evaluated {data.generatedAt.slice(0, 10)}</p>}
      </div>

      {data.caveats && data.caveats.length > 0 && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
          <p className="mb-1 text-sm font-semibold">Read these limits first</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {data.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {data.perClass && (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead className="text-right">Precision</TableHead>
                <TableHead className="text-right">Recall</TableHead>
                <TableHead className="text-right">Sites</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(data.perClass).map(([cls, m]) => (
                <TableRow key={cls}>
                  <TableCell>{(ORDERED_CLASSES as string[]).includes(cls) ? <ClassCell cls={cls as ClassId} /> : cls}</TableCell>
                  <TableCell className="text-right font-mono">{pct(m.precision)}</TableCell>
                  <TableCell className="text-right font-mono">{pct(m.recall)}</TableCell>
                  <TableCell className="text-right font-mono">{m.support}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data.confusion && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Confusion matrix (rows: verified truth, columns: predicted)</p>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Truth \ Predicted</TableHead>
                  {labels.map((l) => (
                    <TableHead key={l} className="text-right">
                      {(CLASS_LABELS as Record<string, string>)[l] ?? l}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.confusion.matrix.map((row, i) => (
                  <TableRow key={labels[i] ?? i}>
                    <TableCell className="font-medium">{(CLASS_LABELS as Record<string, string>)[labels[i]] ?? labels[i]}</TableCell>
                    {row.map((v, j) => (
                      <TableCell key={j} className={`text-right font-mono tabular-nums ${i === j ? "font-bold" : ""}`}>
                        {v}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {data.sites && data.sites.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Every verified site</p>
          <div className="max-h-72 overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead>Truth</TableHead>
                  <TableHead>Predicted</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sites.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="max-w-[16rem] truncate">{s.name}</TableCell>
                    <TableCell>{(CLASS_LABELS as Record<string, string>)[s.trueClass] ?? s.trueClass}</TableCell>
                    <TableCell>{(CLASS_LABELS as Record<string, string>)[s.predictedClass] ?? s.predictedClass}</TableCell>
                    <TableCell>
                      <Badge variant={s.correct ? "secondary" : "destructive"} className="text-xs">
                        {s.correct ? "✓ Correct" : "✗ Missed"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Analytics */

function AnalyticsTab({ totals }: { totals?: HotspotsResponse["totals"] }) {
  if (!totals || totals.raw === 0) return <EmptyState title="Nothing to summarise" hint="There are no hotspots in the selected window." />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Class mix of all {totals.raw.toLocaleString()} hotspots in the window.</p>
      <div className="flex h-5 w-full overflow-hidden rounded-md border" role="img" aria-label="Class mix bar">
        {ORDERED_CLASSES.map((c) => {
          const n = totals.byClass[c] ?? 0;
          return n ? <div key={c} style={{ width: `${(n / totals.raw) * 100}%`, background: CLASS_META[c].color }} title={`${CLASS_LABELS[c]}: ${n}`} /> : null;
        })}
      </div>
      <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {ORDERED_CLASSES.map((c) => (
          <li key={c} className="flex items-center justify-between gap-2">
            <ClassCell cls={c} />
            <span className="font-mono tabular-nums">
              {(totals.byClass[c] ?? 0).toLocaleString()} <span className="text-muted-foreground">({pct((totals.byClass[c] ?? 0) / totals.raw)})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------- Tabs */

export function BottomTabs({
  features,
  totals,
  onSelectHotspot,
  onFly,
}: {
  features: HotspotListItem[];
  totals?: HotspotsResponse["totals"];
  onSelectHotspot: (h: HotspotListItem) => void;
  onFly: (lat: number, lon: number) => void;
}) {
  return (
    <Tabs defaultValue="register" className="rounded-lg border bg-card p-3 sm:p-4">
      <TabsList className="h-auto flex-wrap justify-start">
        <TabsTrigger value="register" className="text-sm">
          Register
        </TabsTrigger>
        <TabsTrigger value="hotspots" className="text-sm">
          Hotspots
        </TabsTrigger>
        <TabsTrigger value="validation" className="text-sm">
          Validation
        </TabsTrigger>
        <TabsTrigger value="analytics" className="text-sm">
          Analytics
        </TabsTrigger>
      </TabsList>
      <TabsContent value="register">
        <RegisterTab onFly={onFly} />
      </TabsContent>
      <TabsContent value="hotspots">
        <HotspotsTab features={features} onSelect={onSelectHotspot} />
      </TabsContent>
      <TabsContent value="validation">
        <ValidationTab />
      </TabsContent>
      <TabsContent value="analytics">
        <AnalyticsTab totals={totals} />
      </TabsContent>
    </Tabs>
  );
}
