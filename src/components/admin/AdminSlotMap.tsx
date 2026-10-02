"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { PH_BOUNDS, PH_CENTER } from "@/lib/geo";
import type { AdminSlot } from "./SlotManager";

const STATUS_COLORS = { OPEN: "#16a34a", FULL: "#f59e0b", CLOSED: "#6b7280" } as const;

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

export default function AdminSlotMap({
  slots,
  draft,
  selectedId,
  onMapClick,
  onSelectSlot,
}: {
  slots: AdminSlot[];
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
      <FlyToSelected target={selected ? { lat: selected.latitude, lng: selected.longitude } : null} />

      {slots.map((slot) => (
        <CircleMarker
          key={slot.id}
          center={[slot.latitude, slot.longitude]}
          radius={slot.id === selectedId ? 12 : 8}
          pathOptions={{
            color: slot.id === selectedId ? "#1d4ed8" : STATUS_COLORS[slot.status],
            fillColor: STATUS_COLORS[slot.status],
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
          pathOptions={{ color: "#1d4ed8", fillColor: "#60a5fa", fillOpacity: 0.9, dashArray: "4" }}
        />
      )}
    </MapContainer>
  );
}
