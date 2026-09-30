"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, useHotspots, usePipelineStatus, useSites } from "@/hooks/use-agni";
import { CLASS_IDS, type ClassId } from "@/lib/classify/types";
import type { HotspotListItem, PersistentSource, TriageItem } from "@/lib/pipeline/types";
import type { FlyTarget, IndustrialInfo, MapView } from "@/components/agni/agni-map";
import { BottomTabs } from "@/components/agni/bottom-tabs";
import { EvidencePanel } from "@/components/agni/evidence-panel";
import { FiltersPanel, type ViewMode } from "@/components/agni/filters-panel";
import { HeadlineStrip } from "@/components/agni/headline-strip";
import { RulesDialog } from "@/components/agni/rules-dialog";
import { ErrorState, NoSnapshot } from "@/components/agni/states";
import { TopBar } from "@/components/agni/top-bar";
import { TriageQueue } from "@/components/agni/triage-queue";

const AgniMap = dynamic(() => import("@/components/agni/agni-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-lg" />,
});

const ALL_CLASSES = new Set<ClassId>(CLASS_IDS);

function AgniApp() {
  const [days, setDays] = useState(1);
  const [mode, setMode] = useState<ViewMode>("classified");
  const [activeClasses, setActiveClasses] = useState<Set<ClassId>>(() => new Set(ALL_CLASSES));
  const [showIndustrial, setShowIndustrial] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [industrialInfo, setIndustrialInfo] = useState<IndustrialInfo>({ state: "hidden" });
  const [minFrp, setMinFrp] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"triage" | "evidence">("triage");
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [, setView] = useState<MapView | null>(null);

  const hot = useHotspots(days, minFrp);
  const status = usePipelineStatus();
  const sites = useSites();

  const fly = useCallback((lat: number, lon: number, zoom = 11) => {
    setFlyTarget((prev) => ({ lat, lon, zoom, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const selectHotspot = useCallback((id: string | null) => {
    if (!id) return; // clicking empty map keeps the current evidence open
    setSelectedId(id);
    setRightTab("evidence");
  }, []);

  const onTriageSelect = useCallback(
    (t: TriageItem) => {
      selectHotspot(t.id);
      fly(t.lat, t.lon, 12);
    },
    [fly, selectHotspot]
  );

  const onHotspotRow = useCallback(
    (h: HotspotListItem) => {
      selectHotspot(h.id);
      fly(h.lat, h.lon, 12);
    },
    [fly, selectHotspot]
  );

  const onSelectSource = useCallback((s: PersistentSource) => fly(s.lat, s.lon, 13), [fly]);

  const anomalyOnly = activeClasses.size === 1 && activeClasses.has("industrial_anomaly");
  const toggleAnomalies = () => setActiveClasses(anomalyOnly ? new Set(ALL_CLASSES) : new Set<ClassId>(["industrial_anomaly"]));
  const toggleClass = (c: ClassId) =>
    setActiveClasses((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const all = hot.data?.features;
  const visible = useMemo(() => {
    const f = all ?? [];
    return mode === "raw" ? f : f.filter((h) => activeClasses.has(h.class));
  }, [all, mode, activeClasses]);

  const windowLabel = days === 1 ? "last 24 h" : `last ${days} days`;
  const noSnapshot = hot.error instanceof ApiError && hot.error.status === 503 && !hot.data;
  const hardError = hot.isError && !hot.data && !noSnapshot;

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        status={status.data}
        statusLoading={status.isLoading}
        statusFailed={status.isError}
        days={days}
        onDays={setDays}
        onHelp={() => setRulesOpen(true)}
      />

      <main className="mx-auto w-full max-w-[1800px] flex-1 space-y-3 p-3 sm:p-4">
        {noSnapshot && <NoSnapshot />}
        {hardError && <ErrorState message={hot.error?.message ?? "Unknown error"} onRetry={() => hot.refetch()} />}

        {hot.isError && hot.data && (
          <div role="status" className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">
              STALE — couldn’t refresh ({hot.error?.message}). Showing data generated {hot.data.generatedAt.slice(0, 16).replace("T", " ")} UTC.
            </span>
            <Button size="sm" variant="outline" onClick={() => hot.refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!noSnapshot && !hardError && (
          <HeadlineStrip
            totals={hot.data?.totals}
            loading={hot.isLoading}
            anomalyOnly={anomalyOnly}
            onToggleAnomalies={toggleAnomalies}
            windowLabel={windowLabel}
          />
        )}

        {hot.data && hot.data.totals.raw === 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm">
            <Info className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">
              No hotspots in this window{minFrp > 0 ? ` with fire power ≥ ${minFrp} MW` : ""}.
              {days < 3 ? " Try a wider window." : minFrp > 0 ? " Try lowering the minimum fire power." : ""}
            </span>
            {days < 3 && (
              <Button size="sm" variant="outline" onClick={() => setDays(3)}>
                Show 3 days
              </Button>
            )}
            {minFrp > 0 && (
              <Button size="sm" variant="outline" onClick={() => setMinFrp(0)}>
                Clear FRP filter
              </Button>
            )}
          </div>
        )}

        {hot.data?.truncated && (
          <p className="flex items-start gap-2 rounded-md border bg-secondary/40 px-3 py-2 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Very dense activity: the map shows the strongest 10,000 detections. Counts above are complete.
          </p>
        )}

        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[280px_minmax(0,1fr)_380px]">
          <div className="order-3 min-w-0 xl:order-1">
            <FiltersPanel
              mode={mode}
              onMode={setMode}
              activeClasses={activeClasses}
              onToggleClass={toggleClass}
              onAllClasses={() => setActiveClasses(new Set(ALL_CLASSES))}
              byClass={hot.data?.totals.byClass}
              showIndustrial={showIndustrial}
              onShowIndustrial={setShowIndustrial}
              showSources={showSources}
              onShowSources={setShowSources}
              industrialInfo={industrialInfo}
              industrialLayer={status.data?.industrialLayer}
              minFrp={minFrp}
              onMinFrp={setMinFrp}
              sourceCount={sites.data?.count}
            />
          </div>

          <div className="order-1 min-w-0 md:col-span-2 xl:order-2 xl:col-span-1">
            <div
              className="relative h-[420px] overflow-hidden rounded-lg border border-border sm:h-[520px] xl:h-[640px]"
              role="region"
              aria-label="Map of classified hotspots over India. Use the triage queue or the Hotspots tab for a keyboard-accessible list."
            >
              <AgniMap
                features={visible}
                raw={mode === "raw"}
                selectedId={selectedId}
                onSelect={selectHotspot}
                flyTarget={flyTarget}
                showIndustrial={showIndustrial}
                showSources={showSources}
                sources={sites.data?.sources ?? []}
                onView={setView}
                onIndustrialInfo={setIndustrialInfo}
                onSelectSource={onSelectSource}
              />
            </div>
          </div>

          <div className="order-2 min-w-0 xl:order-3">
            <Card className="gap-3 py-4">
              <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as "triage" | "evidence")} className="gap-3">
                <CardHeader className="px-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold tracking-wide">
                      {rightTab === "triage" ? "TRIAGE QUEUE" : "EVIDENCE"}
                    </CardTitle>
                    {rightTab === "evidence" && (
                      <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" onClick={() => setRightTab("triage")}>
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Queue
                      </Button>
                    )}
                  </div>
                  <TabsList className="w-full">
                    <TabsTrigger value="triage" className="flex-1 text-sm">
                      Triage{hot.data ? ` (${hot.data.totals.needsAttention})` : ""}
                    </TabsTrigger>
                    <TabsTrigger value="evidence" className="flex-1 text-sm">
                      Evidence
                    </TabsTrigger>
                  </TabsList>
                </CardHeader>
                <CardContent className="max-h-[560px] overflow-y-auto px-4 xl:max-h-[640px]">
                  <TabsContent value="triage">
                    <TriageQueue days={days} selectedId={selectedId} onSelect={onTriageSelect} onWiden={() => setDays(3)} />
                  </TabsContent>
                  <TabsContent value="evidence">
                    <EvidencePanel id={selectedId} onOpenRules={() => setRulesOpen(true)} onBack={() => setRightTab("triage")} />
                  </TabsContent>
                </CardContent>
              </Tabs>
            </Card>
          </div>
        </div>

        <BottomTabs features={visible} totals={hot.data?.totals} onSelectHotspot={onHotspotRow} onFly={(lat, lon) => fly(lat, lon, 13)} />
      </main>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-1 px-3 py-3 text-xs text-muted-foreground sm:px-4 md:flex-row md:items-center md:justify-between">
          <span>
            Data: NASA VIIRS 375 m active fire (GIBS) · © OpenStreetMap contributors (ODbL) · ESA WorldCover 2021 (CC BY 4.0). Real detections only — no simulated data.
          </span>
          <span className="font-mono">
            {hot.data ? `classifier ${hot.data.classifierVersion} · snapshot ${hot.data.generatedAt.slice(0, 16).replace("T", " ")} UTC` : "SIH26162 · AGNI-EYE"}
          </span>
        </div>
      </footer>

      <RulesDialog open={rulesOpen} onOpenChange={setRulesOpen} />
    </div>
  );
}

export default function Home() {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={qc}>
      <AgniApp />
    </QueryClientProvider>
  );
}
