"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AlertTriangle, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useEonet, useFires, useSourcesStatus, useWatchlist, type FiresQuery } from "@/hooks/use-nasa";
import { FiltersPanel, type Filters } from "@/components/command/filters-panel";
import { StatsCards } from "@/components/command/stats-cards";
import { AnalyticsCharts } from "@/components/command/analytics-charts";
import { HotspotTable } from "@/components/command/hotspot-table";
import { AlertsPanel } from "@/components/command/alerts-panel";
import { SettingsDialog } from "@/components/command/settings-dialog";
import { TopBar } from "@/components/command/top-bar";
import type { Bbox, FireFeature } from "@/lib/types";
import { REGION_PRESETS } from "@/lib/types";

const FireMap = dynamic(() => import("@/components/command/fire-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-lg" />,
});

function todayIsoLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

function CommandCenter() {
  const today = useMemo(() => todayIsoLocal(), []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [intervalMs, setIntervalMs] = useState(300000);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lon: number; zoom?: number } | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mapBbox, setMapBbox] = useState<Bbox | null>(null);

  const [filters, setFilters] = useState<Filters>(() => ({
    regionName: "South & Southeast Asia",
    bbox: REGION_PRESETS[1].bbox,
    date: todayIsoLocal(),
    days: 1,
    sources: [], // all
    dayNight: "all",
    minFrp: 0,
  }));

  const firesQuery: FiresQuery = useMemo(
    () => ({
      sources: filters.sources.length === 0 ? "all" : filters.sources.join(","),
      bbox: filters.bbox,
      date: filters.date,
      days: filters.days,
      dayNight: filters.dayNight,
      minFrp: filters.minFrp,
    }),
    [filters]
  );

  const { data: fires, isFetching, refetch } = useFires(firesQuery, intervalMs, autoRefresh);
  const { data: eonet } = useEonet();
  const { data: status, isLoading: statusLoading } = useSourcesStatus();
  const { data: watchData } = useWatchlist();

  const features = fires?.features ?? [];
  const eonetEvents = eonet?.events ?? [];

  const handleFilterChange = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
  };

  const handleUseMapView = () => {
    if (!mapBbox) return;
    handleFilterChange({ regionName: "Map View", bbox: mapBbox });
  };

  const handleSelect = (f: FireFeature) => {
    const p = f.properties;
    setSelectedKey(
      `${p.satellite}|${p.acqDate}|${p.acqTime}|${p.latitude.toFixed(3)}|${p.longitude.toFixed(3)}`
    );
    setFlyTarget({ lat: p.latitude, lon: p.longitude, zoom: 9 });
  };

  const watchRects = (watchData?.regions ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    bbox: { west: r.west, south: r.south, east: r.east, north: r.north } as Bbox,
  }));

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        status={status}
        statusLoading={statusLoading}
        generatedAt={fires?.generatedAt ?? null}
        autoRefresh={autoRefresh}
        intervalMs={intervalMs}
        onToggleAuto={setAutoRefresh}
        onIntervalChange={setIntervalMs}
        onManualRefresh={() => refetch()}
        refreshing={isFetching}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Backend notice banner */}
      {fires?.notice && (
        <div className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300 sm:px-4">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{fires.notice}</span>
        </div>
      )}
      {fires?.meta.truncated && (
        <div className="flex items-start gap-2 border-b border-border/40 bg-secondary/40 px-3 py-1.5 text-[11px] text-muted-foreground sm:px-4">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Extremely dense fire activity — displaying the top 12,000 detections by FRP. Narrow the region or
            raise MIN FRP to see everything.
          </span>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1800px] flex-1 space-y-3 p-3 sm:p-4">
        {/* Stats */}
        <StatsCards stats={fires?.stats} loading={isFetching} />

        <div className="grid gap-3 xl:grid-cols-[290px_minmax(0,1fr)_330px]">
          {/* Left rail */}
          <div className="order-2 min-w-0 xl:order-1">
            <FiltersPanel
              filters={filters}
              onChange={handleFilterChange}
              todayIso={today}
              onUseMapView={handleUseMapView}
              mapBbox={mapBbox}
            />
          </div>

          {/* Map column */}
          <div className="order-1 min-w-0 space-y-3 xl:order-2">
            <div className="relative h-[420px] overflow-hidden rounded-lg border border-border/60 sm:h-[520px] xl:h-[620px]">
              <FireMap
                features={features}
                eonetEvents={eonetEvents}
                flyTarget={flyTarget}
                selectedKey={selectedKey}
                watchRects={watchRects}
                onViewChange={setMapBbox}
                initialBbox={filters.bbox}
              />
            </div>
            <HotspotTable features={features} loading={isFetching && !fires} onSelect={handleSelect} selectedKey={selectedKey} />
          </div>

          {/* Right rail */}
          <div className="order-3 min-w-0 space-y-3">
            <AlertsPanel
              onFlyTo={(lat, lon, zoom) => setFlyTarget({ lat, lon, zoom })}
              currentBbox={mapBbox}
              currentRegionName={filters.regionName}
            />
          </div>
        </div>

        {/* Analytics */}
        <AnalyticsCharts stats={fires?.stats} />
      </main>

      <footer className="mt-auto border-t border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-1 px-3 py-3 text-[10px] text-muted-foreground sm:px-4 md:flex-row md:items-center md:justify-between">
          <span>
            DATA: NASA FIRMS · GIBS active-fire vector tiles (VIIRS S-NPP / NOAA-20 / NOAA-21, MODIS Terra / Aqua)
            · NASA EONET — <span className="text-emerald-400">100% live, zero simulated data</span>
          </span>
          <span className="font-mono">
            IMAGERY: NASA GIBS · Esri | Agni Eye Command v2.0
          </span>
        </div>
      </footer>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

export default function Home() {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false },
        },
      })
  );
  return (
    <QueryClientProvider client={qc}>
      <CommandCenter />
    </QueryClientProvider>
  );
}
