"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  LayersControl,
  Rectangle,
  useMap,
  useMapEvents,
  Marker,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Bbox, EonetEvent, FireFeature } from "@/lib/types";
import { brightnessColor, markerRadius, SOURCE_LABELS } from "@/lib/types";

const GIBS_TRUE_COLOR_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg";

function yesterdayIso(): string {
  const d = new Date(Date.now() - 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

interface MapControllerProps {
  flyTarget: { lat: number; lon: number; zoom?: number } | null;
  onViewChange: (bbox: Bbox) => void;
}

function MapController({ flyTarget, onViewChange }: MapControllerProps) {
  const map = useMap();
  const initialized = useRef(false);

  useEffect(() => {
    if (flyTarget) {
      map.flyTo([flyTarget.lat, flyTarget.lon], flyTarget.zoom ?? Math.max(map.getZoom(), 8), {
        duration: 0.8,
      });
    }
  }, [flyTarget, map]);

  // Publish the initial viewport once the map is ready so "USE MAP VIEW" works immediately.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const b = map.getBounds();
    onViewChange({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
  }, [map, onViewChange]);

  useMapEvents({
    moveend: () => {
      const b = map.getBounds();
      onViewChange({
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
      });
    },
  });

  return null;
}

function EonetIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="transform:translate(-50%,-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:12px solid #22d3ee;filter:drop-shadow(0 0 4px rgba(34,211,238,0.9));"></div>`,
    iconSize: [14, 14] as [number, number],
    iconAnchor: [0, 0] as [number, number],
  });
}

interface FireMapProps {
  features: FireFeature[];
  eonetEvents: EonetEvent[];
  flyTarget: { lat: number; lon: number; zoom?: number } | null;
  selectedKey: string | null;
  watchRects: Array<{ id: string; name: string; bbox: Bbox }>;
  onViewChange: (bbox: Bbox) => void;
  initialBbox: Bbox;
}

export default function FireMap({
  features,
  eonetEvents,
  flyTarget,
  selectedKey,
  watchRects,
  onViewChange,
  initialBbox,
}: FireMapProps) {
  const yday = useMemo(() => yesterdayIso(), []);
  const center = useMemo<[number, number]>(() => {
    return [(initialBbox.north + initialBbox.south) / 2, (initialBbox.east + initialBbox.west) / 2];
  }, [initialBbox]);
  const initialZoom = useMemo(() => {
    const span = Math.max(initialBbox.east - initialBbox.west, initialBbox.north - initialBbox.south);
    if (span > 180) return 2;
    if (span > 90) return 3;
    if (span > 45) return 4;
    return 5;
  }, [initialBbox]);

  return (
    <MapContainer
      center={center}
      zoom={initialZoom}
      minZoom={2}
      maxZoom={13}
      preferCanvas
      worldCopyJump
      className="h-full w-full"
      attributionControl
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Dark Command (Esri)">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            attribution="Esri, HERE, Garmin, FAO, NOAA, USGS"
            maxZoom={16}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite Imagery (Esri)">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Esri, Maxar, Earthstar Geographics"
            maxZoom={18}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name={`NASA VIIRS True Color (${yday})`}>
          <TileLayer
            url={GIBS_TRUE_COLOR_URL.replace("{date}", yday)}
            attribution="NASA GIBS / VIIRS S-NPP"
            maxNativeZoom={9}
            maxZoom={13}
            tileSize={256}
          />
        </LayersControl.BaseLayer>
        <LayersControl.Overlay checked name="Place Labels">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
            attribution="Esri"
            maxZoom={16}
            opacity={0.9}
          />
        </LayersControl.Overlay>
      </LayersControl>

      <MapController flyTarget={flyTarget} onViewChange={onViewChange} />

      {/* Watched regions */}
      {watchRects.map((r) => (
        <Rectangle
          key={`wr-${r.id}`}
          bounds={[
            [r.bbox.south, r.bbox.west],
            [r.bbox.north, r.bbox.east],
          ]}
          pathOptions={{ color: "#f59e0b", weight: 1.5, dashArray: "6 6", fill: false }}
        >
          <Popup>
            <div className="text-xs">
              <div className="font-semibold text-amber-400">Watched region</div>
              <div>{r.name}</div>
            </div>
          </Popup>
        </Rectangle>
      ))}

      {/* Live fire hotspots (canvas-rendered for performance) */}
      {features.map((f, i) => {
        const p = f.properties;
        const key = `${p.satellite}|${p.acqDate}|${p.acqTime}|${p.latitude.toFixed(3)}|${p.longitude.toFixed(3)}`;
        const isSel = key === selectedKey;
        return (
          <CircleMarker
            key={`${key}-${i}`}
            center={[p.latitude, p.longitude]}
            radius={markerRadius(p.frp) + (isSel ? 3 : 0)}
            pathOptions={{
              color: isSel ? "#ffffff" : "rgba(255,255,255,0.55)",
              weight: isSel ? 2 : 0.5,
              fillColor: brightnessColor(p.brightness),
              fillOpacity: 0.82,
            }}
          >
            <Popup>
              <div className="space-y-1 text-xs">
                <div className="font-semibold text-orange-400">
                  {SOURCE_LABELS[p.source] ?? p.source} hotspot
                </div>
                <div className="font-mono">
                  {p.latitude.toFixed(4)}°, {p.longitude.toFixed(4)}°
                </div>
                <div>
                  <span className="text-muted-foreground">Acquired:</span>{" "}
                  <span className="font-mono">
                    {p.acqDate} {p.acqTime} UTC
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Brightness:</span>{" "}
                  <span className="font-mono">{p.brightness.toFixed(1)} K</span>
                </div>
                <div>
                  <span className="text-muted-foreground">FRP:</span>{" "}
                  <span className="font-mono">{p.frp.toFixed(1)} MW</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Pass:</span> {p.dayNight === "D" ? "Day" : "Night"}
                  {p.confidence !== null ? ` · Conf: ${p.confidence}` : ""}
                </div>
                <div className="text-muted-foreground">
                  {p.satellite} · {p.instrument} {p.version ? `· ${p.version}` : ""}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* EONET live incident markers */}
      {eonetEvents.map((ev) => (
        <Marker key={`eonet-${ev.id}`} position={[ev.lat, ev.lon]} icon={EonetIcon()}>
          <Popup>
            <div className="space-y-1 text-xs max-w-[220px]">
              <div className="font-semibold text-cyan-400">NASA EONET · Wildfire incident</div>
              <div className="font-medium">{ev.title}</div>
              {ev.magnitudeValue !== null && (
                <div className="font-mono">
                  {ev.magnitudeValue} {ev.magnitudeUnit}
                </div>
              )}
              {ev.date && <div className="font-mono text-muted-foreground">{ev.date.slice(0, 10)}</div>}
              {ev.sources[0]?.url && (
                <a href={ev.sources[0].url} target="_blank" rel="noreferrer" className="text-orange-400 underline">
                  Source details ↗
                </a>
              )}
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-4 left-3 z-[500] rounded-lg border border-border/60 bg-background/85 px-3 py-2 text-[11px] backdrop-blur">
        <div className="mb-1 font-semibold tracking-wide text-muted-foreground">BRIGHTNESS TEMP (K)</div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#facc15" }} />&lt;310</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#f97316" }} />310–335</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#ea580c" }} />335–360</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#dc2626" }} />360+</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-muted-foreground">
          <span className="inline-block h-0 w-0 border-l-[5px] border-r-[5px] border-b-[9px] border-l-transparent border-r-transparent border-b-cyan-400" />
          EONET incident
        </div>
      </div>
    </MapContainer>
  );
}
