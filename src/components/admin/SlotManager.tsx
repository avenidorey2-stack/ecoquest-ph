"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { CityHit, PsgcRegion } from "@/lib/psgc";
import type { MapArea } from "./AdminSlotMap";
import PlaceSearch from "./PlaceSearch";
import SlotForm, { closedNotice, type SpeciesOption } from "./SlotForm";
import SlotClaims from "./SlotClaims";
import { ChevronRightIcon } from "@/components/ui/icons";

export type AdminSlot = {
  id: string;
  latitude: number;
  longitude: number;
  region: string;
  province: string;
  city: string;
  regionCode: string;
  provinceCode: string;
  cityCode: string;
  barangay: string | null;
  status: "OPEN" | "FULL" | "CLOSED";
  requiredPlantType: string;
  speciesId: string | null;
  pointsPerPlant: number;
  maxParticipants: number;
  questGoal: number;
  /** Quests currently ACTIVE or PENDING_VERIFICATION (= current participants). */
  activeQuests: number;
  /** All quests ever, including completed — a slot with any can't be deleted. */
  totalQuests: number;
};

const AdminSlotMap = dynamic(() => import("./AdminSlotMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-emerald-400/10" />,
});

type Selection = { kind: "new"; lat: number; lng: number } | { kind: "edit"; id: string } | null;
/** delete: slot without history · close: hide from map, keep history · permanent: erase with history. */
type RemoveAction = "delete" | "close" | "permanent";

const STATUS_DOT: Record<AdminSlot["status"], string> = { OPEN: "bg-emerald-400", FULL: "bg-amber-500", CLOSED: "bg-line-strong" };

const STATUS_STYLES: Record<AdminSlot["status"], string> = {
  OPEN: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
  FULL: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
  CLOSED: "bg-card-2 text-ink-2 ring-line",
};

/** Admin slot tool: map (drop a pin to add, click a marker to edit) beside the slot list or form. */
export default function SlotManager({
  slots,
  regions,
  species,
  initialEditId,
}: {
  slots: AdminSlot[];
  regions: PsgcRegion[];
  species: SpeciesOption[];
  /** Opens this slot's edit form on load (e.g. /admin/slots?edit=<id> from the dashboard map). */
  initialEditId?: string;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<Selection>(() =>
    initialEditId && slots.some((s) => s.id === initialEditId) ? { kind: "edit", id: initialEditId } : null,
  );
  // Which slot is asking for confirmation, and of what. "permanent" also needs the checkbox.
  const [confirm, setConfirm] = useState<{ id: string; action: RemoveAction } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The city/municipality found with the map's search box, and its lookup state.
  const [area, setArea] = useState<MapArea | null>(null);
  const [areaBusy, setAreaBusy] = useState(false);
  const [areaError, setAreaError] = useState<string | null>(null);

  // Slots grouped by city/municipality (A–Z). One place is open at a time: the map zooms to its
  // geofence and shows only its slots, so adding one there is easy.
  const [openCity, setOpenCity] = useState<{ code: string; name: string } | null>(null);
  const groups = useMemo(() => {
    const byCity = new Map<string, { cityCode: string; city: string; province: string; slots: AdminSlot[] }>();
    for (const slot of slots) {
      const g = byCity.get(slot.cityCode) ?? { cityCode: slot.cityCode, city: slot.city, province: slot.province, slots: [] };
      g.slots.push(slot);
      byCity.set(slot.cityCode, g);
    }
    return [...byCity.values()].sort((a, b) => a.city.replace(/^City of /, "").localeCompare(b.city.replace(/^City of /, "")));
  }, [slots]);
  const mapSlots = openCity ? slots.filter((s) => s.cityCode === openCity.code) : slots;
  const mapBox = useRef<HTMLDivElement>(null);

  function openPlace(hit: CityHit) {
    setOpenCity({ code: hit.code, name: hit.name });
    findArea(hit);
  }

  function clearPlace() {
    setOpenCity(null);
    setArea(null);
    setAreaError(null);
  }

  async function findArea(hit: CityHit) {
    setAreaBusy(true);
    setAreaError(null);
    const res = await fetch(`/api/admin/geo/boundary?cityCode=${encodeURIComponent(hit.code)}`).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => null) : null;
    setAreaBusy(false);
    if (!data?.geometry && !data?.point) {
      setAreaError(`Couldn't find ${hit.name} on the map. Zoom in by hand.`);
      return;
    }
    setArea({ key: `${hit.code}:${Date.now()}`, geometry: data.geometry, point: data.point });
  }

  const draft = selection?.kind === "new" ? { lat: selection.lat, lng: selection.lng } : null;
  const selectedSlot = selection?.kind === "edit" ? (slots.find((s) => s.id === selection.id) ?? null) : null;

  function ask(id: string, action: RemoveAction) {
    setListError(null);
    setNotice(null);
    setAcknowledged(false);
    setConfirm({ id, action });
  }

  async function remove(slot: AdminSlot, action: RemoveAction) {
    setBusyId(slot.id);
    setListError(null);
    const url = `/api/admin/slots/${slot.id}`;
    const res = await (action === "close"
      ? fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CLOSED" }) })
      : fetch(action === "permanent" ? `${url}?permanent=true` : url, { method: "DELETE" })
    ).catch(() => null);
    setBusyId(null);
    setConfirm(null);
    if (!res?.ok) {
      setListError((res && (await res.json().catch(() => ({}))).error) ?? "Couldn't update the slot.");
      return;
    }
    if (action === "close") {
      const { closed } = await res.json().catch(() => ({}));
      setNotice(closedNotice(slot, closed));
    }
    if (action === "permanent") {
      const r = await res.json().catch(() => ({}));
      setNotice(
        `Deleted “${slot.requiredPlantType}” in ${slot.city}` +
          (r.deletedQuests ? ` and cancelled ${r.deletedQuests} quest(s)` : "") +
          (r.notified ? `; ${r.notified} planter(s) notified` : "") +
          (r.keptApprovedHistory ? ". Approved proofs stay on planters' profiles." : "."),
      );
    }
    router.refresh();
  }

  function renderSlot(slot: AdminSlot) {
    const hasHistory = slot.totalQuests > 0;
    const asking = confirm?.id === slot.id ? confirm.action : null;
    const busy = busyId === slot.id;
    const btn = "rounded-md border border-line px-3 py-1 text-xs font-medium";
    return (
      <li key={slot.id} className="space-y-2 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{slot.requiredPlantType}</p>
            <p className="truncate text-xs text-ink-3">
              {slot.barangay && `${slot.barangay}, `}
              {slot.city}, {slot.province}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${STATUS_STYLES[slot.status]}`}>
            {slot.status.toLowerCase()}
          </span>
        </div>
        <p className="text-xs text-ink-3">
          {slot.activeQuests}/{slot.maxParticipants} planters · goal {slot.questGoal} plant{slot.questGoal === 1 ? "" : "s"}/quest · {slot.pointsPerPlant} pts/plant
          {hasHistory && ` · ${slot.totalQuests} quest(s) in history`}
        </p>

        {asking === "permanent" ? (
          <div role="alertdialog" aria-label="Delete Slot Permanently" className="space-y-2 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-200">
            <p className="font-semibold">Delete this slot permanently?</p>
            <p>
              The slot is removed from every map and list for good.
              {slot.activeQuests > 0 &&
                ` ${slot.activeQuests} quest(s) in progress here will be cancelled and those planters notified.`}{" "}
              Approved proof photos, planted trees, achievements and points stay on planters&apos; profiles.{" "}
              <span className="font-semibold">This can&apos;t be undone.</span>
            </p>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-red-400"
              />
              I understand this slot can&apos;t be restored.
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => remove(slot, "permanent")}
                disabled={!acknowledged || busy}
                className="rounded-md bg-red-600 px-3 py-1 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Deleting…" : "Delete Permanently"}
              </button>
              <button onClick={() => setConfirm(null)} className="rounded-md px-3 py-1 hover:bg-red-400/15">
                Cancel
              </button>
            </div>
          </div>
        ) : asking ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-400/10 p-2 text-xs text-red-300">
            <span className="flex-1">
              {asking === "close"
                ? `Close this slot? It will be hidden from the map and stop accepting proof.${
                    slot.activeQuests > 0
                      ? ` ${slot.activeQuests} planter(s) with a quest here will be notified; their quests end (approved plants and points are kept).`
                      : ""
                  }`
                : "Delete this slot? It has no quests."}
            </span>
            <button
              onClick={() => remove(slot, asking)}
              disabled={busy}
              className="rounded-md bg-red-600 px-2.5 py-1 font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Working…" : asking === "close" ? "Close" : "Delete"}
            </button>
            <button onClick={() => setConfirm(null)} className="rounded-md px-2.5 py-1 text-red-300 hover:bg-red-400/15">
              Keep
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelection({ kind: "edit", id: slot.id })}
              className={`${btn} text-ink-2 hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-300`}
            >
              Edit
            </button>
            {hasHistory ? (
              <>
                {slot.status !== "CLOSED" && (
                  <button
                    onClick={() => ask(slot.id, "close")}
                    title="Hide from the map and keep its planting history"
                    className={`${btn} text-ink-2 hover:border-line-strong hover:bg-card-2`}
                  >
                    Close
                  </button>
                )}
                <button
                  onClick={() => ask(slot.id, "permanent")}
                  className={`${btn} text-red-300 hover:border-red-400/30 hover:bg-red-400/10`}
                >
                  Delete Permanently
                </button>
              </>
            ) : (
              <button onClick={() => ask(slot.id, "delete")} className={`${btn} text-red-300 hover:border-red-400/30 hover:bg-red-400/10`}>
                Delete
              </button>
            )}
          </div>
        )}
      </li>
    );
  }

  // Desktop height = viewport − 4rem app header − 2.75rem admin tabs.
  return (
    <div className="flex flex-1 flex-col lg:h-[calc(100dvh-6.75rem)] lg:flex-row">
      {/* Mobile: fixed 55vh. Desktop: stretches to the row's height (h-auto + flex stretch);
          percentage heights don't resolve here, so the map is absolutely positioned to fill it. */}
      <div ref={mapBox} className="relative h-[55vh] min-h-[320px] scroll-mt-32 lg:h-auto lg:min-h-0 lg:flex-1">
        <AdminSlotMap
          slots={mapSlots}
          area={area}
          draft={draft}
          selectedId={selectedSlot?.id ?? null}
          onMapClick={(lat, lng) => setSelection({ kind: "new", lat, lng })}
          onSelectSlot={(id) => setSelection({ kind: "edit", id })}
        />
        {/* Above Leaflet's panes (z-400) and zoom buttons (z-1000); offset right of the zoom buttons. */}
        <div className="absolute inset-x-3 top-3 z-[1001] flex flex-col items-start gap-1.5 pl-11">
          <PlaceSearch
            // Remounts to show the place opened from the list (or cleared).
            key={openCity?.code ?? "all"}
            initialQuery={openCity?.name ?? ""}
            onPick={openPlace}
            onClear={clearPlace}
            busy={areaBusy}
          />
          {areaError && (
            <p role="alert" className="rounded-lg bg-card-2/95 px-3 py-1.5 text-xs text-rose-300 shadow">
              {areaError}
            </p>
          )}
          {openCity && (
            <p className="flex flex-wrap items-center gap-x-2 rounded-lg bg-card-2/95 px-3 py-1.5 text-xs text-ink-2 shadow">
              <span>
                Showing {openCity.name} only
                {area && !selection && (area.geometry ? ". Tap inside the outline to add a slot." : ". Tap the map to add a slot.")}
              </span>
              <button type="button" onClick={clearPlace} className="-my-2 min-h-11 px-1 font-semibold text-emerald-300 hover:text-emerald-200">
                Show All
              </button>
            </p>
          )}
        </div>
      </div>

      <aside className="bg-card lg:w-[26rem] lg:overflow-y-auto lg:border-l lg:border-line">
        {selection && (draft || selectedSlot) ? (
          <div className="space-y-4 p-4">
            <SlotForm
              // One form instance per new pin session, so typed coordinates don't remount it.
              key={selection.kind === "new" ? "new" : selection.id}
              regions={regions}
              species={species}
              slot={selectedSlot}
              draft={draft}
              onDraftChange={(lat, lng) => setSelection({ kind: "new", lat, lng })}
              onCancel={() => setSelection(null)}
              onSaved={(notice) => {
                setSelection(null);
                setNotice(notice ?? null);
                router.refresh();
              }}
            />
            {/* Separate from the form: changing a claim's end date saves on its own. */}
            {selectedSlot && <SlotClaims key={selectedSlot.id} slotId={selectedSlot.id} />}
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="space-y-1 border-b border-line p-4 text-sm text-ink-2">
              <p className="font-semibold text-ink">
                Planting slots ({slots.length}) in {groups.length} place{groups.length === 1 ? "" : "s"}
              </p>
              <p>Open a place to zoom to its geofence and see only its slots, then click the map to add one. Click a marker or “Edit” to change a slot.</p>
              <ul className="flex flex-wrap gap-3 pt-1 text-xs">
                <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />Open</li>
                <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Full</li>
                <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-line-strong" />Closed</li>
              </ul>
            </div>

            {listError && (
              <p role="alert" className="mx-4 mt-3 rounded-lg bg-red-400/10 p-2 text-xs text-red-300">
                {listError}
              </p>
            )}
            {notice && (
              <p role="status" className="mx-4 mt-3 rounded-lg bg-emerald-400/10 p-2 text-xs text-emerald-300">
                {notice}
              </p>
            )}

            {openCity && !groups.some((g) => g.cityCode === openCity.code) && (
              <p className="mx-4 mt-3 rounded-lg bg-emerald-400/10 p-2 text-xs text-emerald-200">
                No slots in {openCity.name} yet. Click the map inside its outline to add the first one.
              </p>
            )}
            {slots.length === 0 ? (
              <p className="p-6 text-center text-sm text-ink-3">No slots yet — drop a pin on the map to add one.</p>
            ) : (
              <ul className="divide-y divide-line border-b border-line">
                {groups.map((g) => {
                  const isOpen = openCity?.code === g.cityCode;
                  const count = (st: AdminSlot["status"]) => g.slots.filter((x) => x.status === st).length;
                  return (
                    <li key={g.cityCode}>
                      <button
                        type="button"
                        onClick={() => {
                          if (isOpen) return clearPlace();
                          openPlace({ code: g.cityCode, name: g.city, province: g.province });
                          // Phones: the list is under the map — bring the map (now zooming there) into view.
                          if (window.matchMedia("(max-width: 1023px)").matches) mapBox.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        aria-expanded={isOpen}
                        className={`flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-card-2 ${isOpen ? "bg-card-2" : ""}`}
                      >
                        <ChevronRightIcon className={`h-4 w-4 shrink-0 text-ink-3 transition-transform duration-200 ${isOpen ? "rotate-90 text-emerald-300" : ""}`} />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm font-semibold ${isOpen ? "text-emerald-200" : "text-ink"}`}>{g.city}</span>
                          <span className="block truncate text-xs text-ink-3">{g.province}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-ink-3" aria-label={`${count("OPEN")} open, ${count("FULL")} full, ${count("CLOSED")} closed`}>
                          {(["OPEN", "FULL", "CLOSED"] as const).map((st) =>
                            count(st) ? (
                              <span key={st} className="flex items-center gap-1" aria-hidden>
                                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[st]}`} />
                                {count(st)}
                              </span>
                            ) : null,
                          )}
                        </span>
                      </button>
                      {isOpen && <ul className="eq-stagger divide-y divide-line border-t border-line bg-canvas/30">{g.slots.map(renderSlot)}</ul>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
