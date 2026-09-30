"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, GeoJSON, LayersControl, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { HotspotListItem, PersistentSource } from "@/lib/pipeline/types";
import { fetchIndustrial, type IndustrialFC } from "@/hooks/use-agni";
import { CLASS_META, SITE_CATEGORY_LABEL, formatSubtype } from "./class-meta";
import { HotspotCanvasLayer } from "./hotspot-canvas-layer";

export interface MapView {
  bbox: { west: number; south: number; east: number; north: number };
  zoom: number;
}

export interface FlyTarget {
  lat: number;
  lon: number;
  zoom?: number;
  nonce: number;
}

export interface IndustrialInfo {
  state: "hidden" | "zoom" | "loading" | "ok" | "error";
  matched?: number;
  truncated?: boolean;
  message?: string;
}

const INDIA_BOUNDS: L.LatLngBoundsExpression = [
  [6, 68],
  [37.5, 98],
];
const INDUSTRIAL_MIN_ZOOM = 7;
const GIBS_TRUE_COLOR_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function HotspotsBinding({
  features,
  raw,
  selectedId,
  onSelect,
}: {
  features: HotspotListItem[];
  raw: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const map = useMap();
  const layerRef = useRef<HotspotCanvasLayer | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const layer = new HotspotCanvasLayer((it) => onSelectRef.current(it ? it.id : null));
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      layer.remove();
      layerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    layerRef.current?.update(features, raw, selectedId);
  }, [features, raw, selectedId]);

  return null;
}

function MapController({ flyTarget, onView }: { flyTarget: FlyTarget | null; onView: (v: MapView) => void }) {
  const map = useMap();
  const publish = () => {
    const b = map.getBounds();
    onView({ bbox: { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, zoom: map.getZoom() });
  };
  useMapEvents({ moveend: publish });
  useEffect(publish, [map]);

  useEffect(() => {
    if (!flyTarget) return;
    const zoom = flyTarget.zoom ?? Math.max(map.getZoom(), 9);
    if (reducedMotion()) map.setView([flyTarget.lat, flyTarget.lon], zoom, { animate: false });
    else map.flyTo([flyTarget.lat, flyTarget.lon], zoom, { duration: 0.8 });
  }, [flyTarget, map]);
  return null;
}

function IndustrialOverlay({ onInfo }: { onInfo: (i: IndustrialInfo) => void }) {
  const map = useMap();
  const [data, setData] = useState<{ fc: IndustrialFC; n: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const counter = useRef(0);

  const refresh = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      abort.current?.abort();
      if (map.getZoom() < INDUSTRIAL_MIN_ZOOM) {
        setData(null);
        onInfo({ state: "zoom" });
        return;
      }
      const ctrl = new AbortController();
      abort.current = ctrl;
      onInfo({ state: "loading" });
      const b = map.getBounds();
      try {
        const fc = await fetchIndustrial(
          { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
          ctrl.signal
        );
        setData({ fc, n: ++counter.current });
        onInfo({ state: "ok", matched: fc.matched, truncated: fc.truncated });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        onInfo({ state: "error", message: (e as Error).message });
      }
    }, 400);
  };

  useMapEvents({ moveend: refresh });
  useEffect(() => {
    refresh();
    map.attributionControl.addAttribution("© OpenStreetMap contributors (industrial layer)");
    return () => {
      if (timer.current) clearTimeout(timer.current);
      abort.current?.abort();
      map.attributionControl.removeAttribution("© OpenStreetMap contributors (industrial layer)");
      onInfo({ state: "hidden" });
    };
  }, [map]);

  if (!data) return null;
  return (
    <GeoJSON
      key={data.n}
      data={data.fc as unknown as GeoJSON.FeatureCollection}
      style={() => ({ color: "#a78bfa", weight: 1, fillColor: "#8b7fb8", fillOpacity: 0.14, opacity: 0.8 })}
      pointToLayer={(_f, latlng) =>
        L.circleMarker(latlng, { radius: 4, color: "#a78bfa", weight: 1.5, fillColor: "#a78bfa", fillOpacity: 0.25 })
      }
      onEachFeature={(f, layer) => {
        const p = f.properties as { name: string | null; category: string };
        layer.bindTooltip(`${p.name ?? "Unnamed"} · ${SITE_CATEGORY_LABEL[p.category] ?? p.category}`, { sticky: true });
      }}
    />
  );
}

interface AgniMapProps {
  features: HotspotListItem[];
  raw: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  flyTarget: FlyTarget | null;
  showIndustrial: boolean;
  showSources: boolean;
  sources: PersistentSource[];
  onView: (v: MapView) => void;
  onIndustrialInfo: (i: IndustrialInfo) => void;
  onSelectSource: (s: PersistentSource) => void;
}

export default function AgniMap({
  features,
  raw,
  selectedId,
  onSelect,
  flyTarget,
  showIndustrial,
  showSources,
  sources,
  onView,
  onIndustrialInfo,
  onSelectSource,
}: AgniMapProps) {
  const yday = useMemo(() => new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10), []);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        bounds={INDIA_BOUNDS}
        minZoom={4}
        maxZoom={16}
        maxBounds={[
          [-5, 55],
          [50, 110],
        ]}
        maxBoundsViscosity={0.6}
        zoomAnimation={false}
        zoomSnap={0.25}
        boundsOptions={{ padding: [4, 4] }}
        preferCanvas
        className="h-full w-full"
        attributionControl
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Dark (Esri)">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
              attribution="Esri, HERE, Garmin, FAO, NOAA, USGS"
              maxZoom={16}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite (Esri)">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Esri, Maxar, Earthstar Geographics"
              maxZoom={18}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name={`NASA VIIRS true colour (${yday})`}>
            <TileLayer
              url={GIBS_TRUE_COLOR_URL.replace("{date}", yday)}
              attribution="NASA GIBS / VIIRS S-NPP"
              maxNativeZoom={9}
              maxZoom={16}
            />
          </LayersControl.BaseLayer>
          <LayersControl.Overlay checked name="Place labels">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
              attribution="Esri"
              maxZoom={16}
              opacity={0.9}
            />
          </LayersControl.Overlay>
        </LayersControl>

        <MapController flyTarget={flyTarget} onView={onView} />
        {showIndustrial && <IndustrialOverlay onInfo={onIndustrialInfo} />}

        {showSources &&
          sources.map((s) => (
            <CircleMarker
              key={s.id}
              center={[s.lat, s.lon]}
              radius={13}
              pathOptions={{ color: CLASS_META[s.class].color, weight: 2, fill: false, dashArray: "3 3", opacity: 0.95 }}
              eventHandlers={{ click: () => onSelectSource(s) }}
            >
              <Tooltip>
                <div className="text-xs">
                  <div className="font-semibold">{s.siteName ?? formatSubtype(s.subtype) ?? "Persistent thermal source"}</div>
                  <div>
                    {CLASS_META[s.class].label} · active {s.daysActive}/{s.windowDays} days
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          ))}

        <HotspotsBinding features={features} raw={raw} selectedId={selectedId} onSelect={onSelect} />
      </MapContainer>

      {raw && (
        <div
          className="pointer-events-none absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-md border border-border bg-background/90 px-3 py-1 text-xs font-semibold tracking-wide text-foreground shadow"
          role="status"
        >
          RAW VIEW · every detection, unlabelled
        </div>
      )}
    </div>
  );
}
