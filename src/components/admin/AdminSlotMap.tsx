"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { Geometry } from "geojson";
import { useEffect } from "react";
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { PH_BOUNDS, PH_CENTER } from "@/lib/geo";
import { MAP_BOUNDARY, MAP_SELECTED, SLOT_STATUS_COLORS } from "@/lib/palette";
import type { AdminSlot } from "./SlotManager";


function ClickToPin({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

const FOCUS_ZOOM = 13;

/** Pans/zooms to the slot being edited (e.g. picked from the list or opened via ?edit=). */
function FlyToSelected({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();
  const lat = target?.lat;
  const lng = target?.lng;
  useEffect(() => {
    if (lat === undefined || lng === undefined) return;
    map.flyTo([lat, lng], Math.max(map.getZoom(), FOCUS_ZOOM), { duration: 0.8 });
  }, [map, lat, lng]);
  return null;
}

/** A city/municipality found with the map's search box: its outline, or its center point. */
export type MapArea = { key: string; geometry: Geometry | null; point: [number, number] | null };

const AREA_STYLE = { color: MAP_BOUNDARY, weight: 2, dashArray: "6 6", fillOpacity: 0.06 };
const AREA_POINT_ZOOM = 13;

/** Zooms to the searched area once per search (`key`), not on every re-render. */
function FitToArea({ area }: { area: MapArea }) {
  const map = useMap();
  useEffect(() => {
    if (area.geometry) {
      const bounds = L.geoJSON(area.geometry).getBounds();
      if (bounds.isValid()) map.flyToBounds(bounds, { padding: [32, 32], duration: 0.9 });
    } else if (area.point) {
      map.flyTo(area.point, AREA_POINT_ZOOM, { duration: 0.9 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fit per search, keyed by `area.key`
  }, [area.key, map]);
  return null;
}

export default function AdminSlotMap({
  slots,
  draft,
  selectedId,
  onMapClick,
  onSelectSlot,
  area,
}: {
  slots: AdminSlot[];
  /** The searched city/municipality to zoom to and outline. */
  area?: MapArea | null;
  draft: { lat: number; lng: number } | null;
  selectedId: string | null;
  onMapClick: (lat: number, lng: number) => void;
  onSelectSlot: (id: string) => void;
}) {
  const selected = selectedId ? slots.find((s) => s.id === selectedId) : undefined;
  return (
    <MapContainer
      center={PH_CENTER}
      zoom={6}
      minZoom={5}
      maxBounds={PH_BOUNDS}
      maxBoundsViscosity={1}
      // Fills its `relative` wrapper in SlotManager (absolute, so it doesn't depend on % heights).
      className="absolute! inset-0 cursor-crosshair"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickToPin onPick={onMapClick} />
      {area && <FitToArea area={area} />}
      {/* Not interactive, so a click inside the outline still drops a pin. */}
      {area?.geometry && <GeoJSON key={area.key} data={area.geometry} style={AREA_STYLE} interactive={false} />}
      <FlyToSelected target={selected ? { lat: selected.latitude, lng: selected.longitude } : null} />

      {slots.map((slot) => (
        <CircleMarker
          key={slot.id}
          center={[slot.latitude, slot.longitude]}
          radius={slot.id === selectedId ? 12 : 8}
          pathOptions={{
            color: slot.id === selectedId ? MAP_SELECTED.stroke : SLOT_STATUS_COLORS[slot.status],
            fillColor: SLOT_STATUS_COLORS[slot.status],
            fillOpacity: 0.8,
            weight: slot.id === selectedId ? 4 : 2,
          }}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e); // don't also drop a new pin
              onSelectSlot(slot.id);
            },
          }}
        >
          <Tooltip>
            {slot.requiredPlantType} · {slot.city} · {slot.status}
          </Tooltip>
        </CircleMarker>
      ))}

      {draft && (
        <CircleMarker
          center={[draft.lat, draft.lng]}
          radius={10}
          pathOptions={{ color: MAP_SELECTED.stroke, fillColor: MAP_SELECTED.fill, fillOpacity: 0.9, dashArray: "4" }}
        />
      )}
    </MapContainer>
  );
}
