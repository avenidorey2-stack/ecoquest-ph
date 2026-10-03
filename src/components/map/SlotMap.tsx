"use client";

import "leaflet/dist/leaflet.css";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { Geometry } from "geojson";
import { PH_BOUNDS, PH_CENTER } from "@/lib/geo";

type SlotDTO = {
  id: string;
  latitude: number;
  longitude: number;
  region: string;
  province: string;
  city: string;
  barangay: string | null;
  status: "OPEN" | "FULL" | "CLOSED";
  requiredPlantType: string;
  pointsPerPlant: number;
  participants: number;
  maxParticipants: number;
  questGoal: number;
  spotsLeft: number;
  alreadyClaimed: boolean;
  claimable: boolean;
};

function FitToBoundary({ geometry }: { geometry: Geometry }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.geoJSON(geometry).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
  }, [geometry, map]);
  return null;
}

/** Zoom to fit the given slots once they've loaded (admin: nationwide; city map: fallback). */
function FitToSlots({ slots }: { slots: SlotDTO[] }) {
  const map = useMap();
  const key = slots.map((s) => s.id).join(",");
  useEffect(() => {
    if (!slots.length) return;
    const bounds = L.latLngBounds(slots.map((s) => [s.latitude, s.longitude] as [number, number]));
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 13 });
    // Re-fit only when the set of slots changes, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

const STATUS_COLORS = { OPEN: "#16a34a", FULL: "#f59e0b", CLOSED: "#6b7280" } as const;

function markerColor(slot: SlotDTO, adminView: boolean) {
  if (adminView) return STATUS_COLORS[slot.status];
  if (slot.alreadyClaimed) return "#2563eb"; // blue: yours
  if (slot.claimable) return "#16a34a"; // green: claimable
  return "#9ca3af"; // gray: outside your city or full
}

/**
 * `cityOnly`: show just the slots in the user's home city (dashboard card).
 * `adminView`: every slot nationwide (closed included) with links to edit them; no claiming.
 */
export default function SlotMap({ cityOnly = false, adminView = false }: { cityOnly?: boolean; adminView?: boolean }) {
  const router = useRouter();
  const [slots, setSlots] = useState<SlotDTO[]>([]);
  const [boundary, setBoundary] = useState<Geometry | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  const loadSlots = useCallback(async () => {
    const res = await fetch(adminView ? "/api/slots?scope=all" : cityOnly ? "/api/slots?scope=city" : "/api/slots");
    if (res.ok) setSlots((await res.json()).slots);
  }, [cityOnly, adminView]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    loadSlots();
    if (adminView) return; // admins see the whole country, not their home-city boundary
    fetch("/api/geo/boundary")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setBoundary(data?.geometry ?? null));
  }, [loadSlots, adminView]);

  async function claim(slotId: string) {
    setClaiming(slotId);
    const res = await fetch(`/api/slots/${slotId}/claim`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? "Slot claimed! Your quest has started." : (data.error ?? "Claim failed."));
    setClaiming(null);
    if (res.ok) {
      loadSlots();
      router.refresh(); // update the dashboard's quest list
    }
  }

  return (
    <div className="relative h-full w-full">
      {message && (
        <div className="absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-md bg-white px-4 py-2 text-sm shadow">
          {message}
          <button className="ml-3 text-gray-500" onClick={() => setMessage(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <MapContainer
        center={PH_CENTER}
        zoom={6}
        minZoom={5}
        maxBounds={PH_BOUNDS}
        maxBoundsViscosity={1}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {boundary && !adminView && (
          <>
            <GeoJSON
              data={boundary}
              style={{ color: "#16a34a", weight: 2, fillOpacity: 0.08 }}
            />
            <FitToBoundary geometry={boundary} />
          </>
        )}
        {/* Admins: fit every slot. City map without an OSM outline: at least zoom to the city's slots. */}
        {(adminView || (cityOnly && !boundary)) && <FitToSlots slots={slots} />}

        {slots.map((slot) => (
          <CircleMarker
            key={slot.id}
            center={[slot.latitude, slot.longitude]}
            radius={9}
            pathOptions={{ color: markerColor(slot, adminView), fillColor: markerColor(slot, adminView), fillOpacity: 0.8 }}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <p className="font-semibold">{slot.requiredPlantType}</p>
                <p>
                  {slot.barangay && `${slot.barangay}, `}
                  {slot.city}, {slot.province}
                </p>
                {adminView && <p className="text-xs text-gray-500">{slot.region}</p>}
                <p>
                  {slot.pointsPerPlant} pts / plant · quest goal: {slot.questGoal} plant{slot.questGoal === 1 ? "" : "s"}
                </p>
                <p>
                  {slot.participants} / {slot.maxParticipants} planters · {slot.spotsLeft} spot{slot.spotsLeft === 1 ? "" : "s"} left
                </p>
                {adminView ? (
                  <>
                    <p>
                      Status: <span className="font-medium">{slot.status.toLowerCase()}</span>
                    </p>
                    <a
                      href={`/admin/slots?edit=${encodeURIComponent(slot.id)}`}
                      className="mt-1 inline-block rounded bg-emerald-700 px-3 py-1 text-white! no-underline hover:bg-emerald-800"
                    >
                      Edit slot →
                    </a>
                  </>
                ) : slot.alreadyClaimed ? (
                  <p className="text-blue-600">You have an active quest here.</p>
                ) : slot.claimable ? (
                  <button
                    onClick={() => claim(slot.id)}
                    disabled={claiming === slot.id}
                    className="mt-1 rounded bg-green-600 px-3 py-1 text-white disabled:opacity-50"
                  >
                    {claiming === slot.id ? "Claiming…" : "Claim slot"}
                  </button>
                ) : slot.status === "OPEN" && slot.spotsLeft === 0 ? (
                  <p className="text-gray-500">This slot is full right now.</p>
                ) : (
                  <p className="text-gray-500">Only claimable by residents of {slot.city}.</p>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
