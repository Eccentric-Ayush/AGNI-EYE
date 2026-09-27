"use client";

import { useState } from "react";
import { AlertTriangle, BellRing, Plus, Radar, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAddWatchRegion,
  useAlerts,
  useClearAlerts,
  useDeleteWatchRegion,
  useEonet,
  useScanAlerts,
  useWatchlist,
} from "@/hooks/use-nasa";
import type { Bbox, EonetEvent, FireAlert } from "@/lib/types";
import { severityColor } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

interface AlertsPanelProps {
  onFlyTo: (lat: number, lon: number, zoom?: number) => void;
  currentBbox: Bbox | null;
  currentRegionName: string;
}

function AlertRow({ a, onFly }: { a: FireAlert; onFly: () => void }) {
  return (
    <button
      onClick={onFly}
      className="flex w-full items-start gap-2 border-b border-border/30 px-3 py-2 text-left text-[11px] transition-colors hover:bg-orange-500/10"
    >
      <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${severityColor(a.severity)}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={`px-1 py-0 text-[9px] uppercase ${severityColor(a.severity)}`}>
            {a.severity}
          </Badge>
          <span className="truncate font-medium text-foreground">{a.regionName}</span>
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">
          {a.lat.toFixed(3)}, {a.lon.toFixed(3)} · {a.acquiredAt} · {a.satellite}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">
          FRP {a.frp.toFixed(1)} MW · Brightness {a.brightness.toFixed(0)} K · {a.dayNight === "N" ? "Night" : "Day"}
        </div>
      </div>
    </button>
  );
}

function EonetRow({ ev, onFly }: { ev: EonetEvent; onFly: () => void }) {
  return (
    <button
      onClick={onFly}
      className="flex w-full items-start gap-2 border-b border-border/30 px-3 py-2 text-left text-[11px] transition-colors hover:bg-cyan-500/10"
    >
      <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground">{ev.title}</div>
        <div className="font-mono text-[10px] text-muted-foreground">
          {ev.lat.toFixed(2)}, {ev.lon.toFixed(2)}
          {ev.date ? ` · ${ev.date.slice(0, 10)}` : ""}
          {ev.magnitudeValue !== null ? ` · ${ev.magnitudeValue} ${ev.magnitudeUnit}` : ""}
        </div>
        {ev.description && (
          <div className="line-clamp-2 text-[10px] text-muted-foreground/80">{ev.description}</div>
        )}
      </div>
    </button>
  );
}

export function AlertsPanel({ onFlyTo, currentBbox, currentRegionName }: AlertsPanelProps) {
  const { data: alertsData, isLoading: alertsLoading } = useAlerts(150);
  const { data: watchData } = useWatchlist();
  const { data: eonetData, isLoading: eonetLoading } = useEonet(30, 60);
  const scan = useScanAlerts();
  const addRegion = useAddWatchRegion();
  const deleteRegion = useDeleteWatchRegion();
  const clearAlerts = useClearAlerts();
  const { toast } = useToast();
  const [newName, setNewName] = useState("");

  const alerts: FireAlert[] = alertsData?.alerts ?? [];
  const events: EonetEvent[] = eonetData?.events ?? [];

  const handleAdd = () => {
    if (!currentBbox) {
      toast({ title: "Move the map first", description: "The current viewport becomes the watched region." });
      return;
    }
    const name = newName.trim() || `${currentRegionName} Watch`;
    addRegion.mutate(
      { name, ...currentBbox },
      {
        onSuccess: () => {
          setNewName("");
          toast({ title: "Region under watch", description: `“${name}” will be scanned for new hotspots.` });
        },
        onError: (e) => toast({ title: "Failed to add region", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleScan = () => {
    scan.mutate(undefined, {
      onSuccess: (d) => {
        toast({
          title: `Scan complete — ${d.newAlerts} new alert${d.newAlerts === 1 ? "" : "s"}`,
          description: d.message ?? `${d.scanned} region(s) scanned against live satellite feed in ${(d.fetchMs / 1000).toFixed(1)}s.`,
        });
      },
      onError: (e) => toast({ title: "Scan failed", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <Card className="border-border/60 bg-card/70 backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-muted-foreground">
          <Radar className="h-3.5 w-3.5 text-orange-500" /> ALERTS & WATCHLIST
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Tabs defaultValue="fire-alerts">
          <TabsList className="grid h-8 w-full grid-cols-3 bg-secondary/40 text-[10px]">
            <TabsTrigger value="fire-alerts" className="gap-1 text-[10px]">
              WATCH ALERTS
              {alerts.length > 0 && (
                <span className="rounded-full bg-orange-500/20 px-1.5 font-mono text-[9px] text-orange-400">
                  {alerts.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="eonet" className="text-[10px]">
              NASA EONET
            </TabsTrigger>
            <TabsTrigger value="regions" className="text-[10px]">
              REGIONS
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fire-alerts" className="space-y-2">
            <div className="flex gap-1.5">
              <Button
                size="sm"
                onClick={handleScan}
                disabled={scan.isPending || (watchData?.regions.length ?? 0) === 0}
                className="h-7 flex-1 gap-1 bg-orange-600 text-[10px] text-white hover:bg-orange-500"
              >
                <Radar className={`h-3 w-3 ${scan.isPending ? "animate-spin" : ""}`} />
                {scan.isPending ? "SCANNING LIVE FEED…" : "SCAN REGIONS NOW"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => clearAlerts.mutate()}
                className="h-7 px-2 text-[10px]"
                title="Clear all alerts"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <ScrollArea className="h-56">
              {alerts.map((a) => (
                <AlertRow key={a.id} a={a} onFly={() => onFlyTo(a.lat, a.lon, 9)} />
              ))}
              {!alertsLoading && alerts.length === 0 && (
                <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                  No alerts yet. Add a watch region below, then scan the live feed.
                </p>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="eonet">
            <ScrollArea className="h-56">
              {events.map((ev) => (
                <EonetRow key={ev.id} ev={ev} onFly={() => onFlyTo(ev.lat, ev.lon, 8)} />
              ))}
              {eonetLoading && (
                <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">Loading live EONET feed…</p>
              )}
              {!eonetLoading && events.length === 0 && (
                <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                  No open wildfire events in the last 30 days.
                </p>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="regions" className="space-y-2">
            <div className="flex gap-1.5">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={`${currentRegionName} — name (optional)`}
                className="h-7 text-[11px]"
              />
              <Button size="sm" onClick={handleAdd} disabled={addRegion.isPending} className="h-7 gap-1 bg-orange-600 px-2 text-[10px] text-white hover:bg-orange-500">
                <Plus className="h-3 w-3" /> WATCH
              </Button>
            </div>
            <ScrollArea className="h-48">
              {(watchData?.regions ?? []).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 border-b border-border/30 px-1 py-1.5 text-[11px]"
                >
                  <button
                    onClick={() => onFlyTo((r.north + r.south) / 2, (r.east + r.west) / 2, 5)}
                    className="flex-1 truncate text-left hover:text-orange-400"
                  >
                    {r.name}
                    <span className="ml-1 font-mono text-[9px] text-muted-foreground">
                      [{r.west.toFixed(0)},{r.south.toFixed(0)} → {r.east.toFixed(0)},{r.north.toFixed(0)}]
                    </span>
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-red-400"
                    onClick={() => deleteRegion.mutate(r.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {(watchData?.regions.length ?? 0) === 0 && (
                <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                  No watched regions. Position the map, name it, and press WATCH.
                </p>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
