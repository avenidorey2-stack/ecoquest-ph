"use client";

import "leaflet/dist/leaflet.css";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { Geometry } from "geojson";
import { PH_BOUNDS, PH_CENTER } from "@/lib/geo";
import { CloseIcon, ExpandIcon } from "@/components/ui/icons";

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

/** Leaflet caches the map size: re-measure whenever the container resizes (expand/collapse, rotation). */
function TrackContainerSize() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

/**
 * One-finger panning on/off. Off for the inline map on touch screens, so swiping over it
 * scrolls the page instead of trapping the user; taps and pinch-zoom still work there.
 */
function Panning({ enabled }: { enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (enabled) map.dragging.enable();
    else map.dragging.disable();
  }, [enabled, map]);
  return null;
}

const STATUS_COLORS = { OPEN: "#16a34a", FULL: "#f59e0b", CLOSED: "#6b7280" } as const;
const PLANTER_COLORS = { claimable: "#16a34a", yours: "#2563eb", other: "#9ca3af" } as const;

const ADMIN_LEGEND: [label: string, color: string][] = [
  ["Open", STATUS_COLORS.OPEN],
  ["Full", STATUS_COLORS.FULL],
  ["Closed", STATUS_COLORS.CLOSED],
];
const PLANTER_LEGEND: [label: string, color: string][] = [
  ["Claimable", PLANTER_COLORS.claimable],
  ["Your quest", PLANTER_COLORS.yours],
  ["Full", PLANTER_COLORS.other],
];

const BOUNDARY_STYLE = { color: "#16a34a", weight: 2, fillOpacity: 0.08 };

function markerColor(slot: SlotDTO, adminView: boolean) {
  if (adminView) return STATUS_COLORS[slot.status];
  if (slot.alreadyClaimed) return PLANTER_COLORS.yours;
  if (slot.claimable) return PLANTER_COLORS.claimable;
  return PLANTER_COLORS.other; // outside your city or full
}

/**
 * `cityOnly`: show just the slots in the user's home city (dashboard card).
 * `adminView`: every slot nationwide (closed included) with links to edit them; no claiming.
 * The Expand button switches to a full-screen map with bigger room to tap markers on phones.
 */
export default function SlotMap({ cityOnly = false, adminView = false }: { cityOnly?: boolean; adminView?: boolean }) {
  const router = useRouter();
  const [slots, setSlots] = useState<SlotDTO[]>([]);
  const [boundary, setBoundary] = useState<Geometry | null>(null);
  const [cityName, setCityName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Rendered client-side only (SlotMapLoader uses ssr: false), so `window` is available here.
  const [touch] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  // Canvas renderer with a click tolerance: fingertips get a ~46px hit area around each marker.
  const [renderer] = useState(() => L.canvas({ tolerance: touch ? 10 : 2 }));

  const loadSlots = useCallback(async () => {
    try {
      const res = await fetch(adminView ? "/api/slots?scope=all" : cityOnly ? "/api/slots?scope=city" : "/api/slots");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSlots((await res.json()).slots);
    } catch {
      setMessage("Couldn't load planting slots. Please refresh the page.");
    }
  }, [cityOnly, adminView]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    loadSlots();
    if (adminView) return; // admins see the whole country, not their home-city boundary
    fetch("/api/geo/boundary")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setBoundary(data?.geometry ?? null);
        setCityName(data?.city ?? null);
      })
      .catch(() => setBoundary(null)); // no outline: the city map falls back to fitting its slots
  }, [loadSlots, adminView]);

  // Full screen: lock the page scroll behind the map, and let Escape close it.
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  async function claim(slotId: string) {
    setClaiming(slotId);
    try {
      const res = await fetch(`/api/slots/${slotId}/claim`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setMessage(res.ok ? "Slot claimed! Your quest has started." : (data.error ?? "Claim failed."));
      if (res.ok) {
        loadSlots();
        router.refresh(); // update the dashboard's quest list
      }
    } catch {
      setMessage("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setClaiming(null);
    }
  }

  const legend = adminView ? ADMIN_LEGEND : PLANTER_LEGEND;
  const areaLabel = adminView ? "All regions" : cityName;

  return (
    // `isolate` keeps Leaflet's internal z-indexes (up to 1000) from escaping above page overlays.
    <div className={expanded ? "fixed inset-0 isolate z-[1400] m-0 bg-card" : "relative isolate h-full w-full"}>
      <MapContainer
        center={PH_CENTER}
        zoom={6}
        minZoom={5}
        maxBounds={PH_BOUNDS}
        maxBoundsViscosity={1}
        renderer={renderer}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <TrackContainerSize />
        <Panning enabled={expanded || !touch} />

        {boundary && !adminView && (
          <>
            {/* Non-interactive so taps inside the city outline fall through to the markers. */}
            <GeoJSON data={boundary} style={BOUNDARY_STYLE} interactive={false} />
            <FitToBoundary geometry={boundary} />
          </>
        )}
        {/* Admins: fit every slot. City map without an OSM outline: at least zoom to the city's slots. */}
        {(adminView || (cityOnly && !boundary)) && <FitToSlots slots={slots} />}

        {slots.map((slot) => (
          <CircleMarker
            key={slot.id}
            center={[slot.latitude, slot.longitude]}
            radius={touch ? 12 : 9}
            pathOptions={{ color: markerColor(slot, adminView), fillColor: markerColor(slot, adminView), fillOpacity: 0.8 }}
          >
            {/* Top padding keeps an opened popup clear of the Expand / Close button. */}
            <Popup autoPanPadding={[12, 12]} autoPanPaddingTopLeft={[12, 64]}>
              <div className="space-y-1 text-sm">
                <p className="font-semibold">{slot.requiredPlantType}</p>
                <p>
                  {slot.barangay && `${slot.barangay}, `}
                  {slot.city}, {slot.province}
                </p>
                {adminView && <p className="text-xs text-ink-3">{slot.region}</p>}
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
                      className="mt-1 inline-block rounded-lg bg-emerald-400 px-3 py-2 font-semibold text-emerald-950! no-underline hover:bg-emerald-300"
                    >
                      Edit slot
                    </a>
                  </>
                ) : slot.alreadyClaimed ? (
                  <p className="text-blue-400">You have an active quest here.</p>
                ) : slot.claimable ? (
                  <button
                    type="button"
                    onClick={() => claim(slot.id)}
                    disabled={claiming !== null}
                    className="mt-2 w-full rounded-lg bg-emerald-400 px-3 py-2.5 font-semibold text-emerald-950 hover:bg-emerald-300 disabled:opacity-50"
                  >
                    {claiming === slot.id ? "Claiming…" : "Claim slot"}
                  </button>
                ) : slot.status === "OPEN" && slot.spotsLeft === 0 ? (
                  <p className="text-ink-3">This slot is full right now.</p>
                ) : (
                  <p className="text-ink-3">Only claimable by residents of {slot.city}.</p>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? "Close full-screen map" : "Expand map to full screen"}
        className="absolute right-3 top-3 z-[1000] flex h-11 items-center gap-1.5 rounded-xl bg-card px-3 text-sm font-semibold text-ink-2 shadow-md ring-1 ring-white/10 hover:bg-card-2 focus-visible:outline-2 focus-visible:outline-emerald-400 active:bg-card-2"
      >
        {expanded ? <CloseIcon className="h-4 w-4" /> : <ExpandIcon className="h-4 w-4" />}
        {expanded ? "Close" : "Expand"}
      </button>

      {/* Below the zoom control and the Expand button, so it never covers either. */}
      {message && (
        <div
          role="status"
          className="absolute inset-x-14 top-16 z-[1000] mx-auto flex w-fit max-w-sm items-start gap-2 rounded-lg bg-card px-4 py-2 text-sm shadow-md ring-1 ring-white/10"
        >
          <span>{message}</span>
          <button type="button" className="-my-1 -mr-2 px-2 py-1 text-ink-3" onClick={() => setMessage(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {/* The dashboard card's legend sits outside the map, so repeat it in full screen. */}
      {expanded && (
        <div className="pointer-events-none absolute bottom-8 left-3 z-[1000] max-w-[calc(100%-1.5rem)] rounded-xl bg-card/95 px-3 py-2 text-xs text-ink-2 shadow-md ring-1 ring-white/10">
          {areaLabel && <p className="font-semibold text-ink">{areaLabel}</p>}
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {legend.map(([label, color]) => (
              <li key={label} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
