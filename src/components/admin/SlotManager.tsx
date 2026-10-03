"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PsgcRegion } from "@/lib/psgc";
import SlotForm, { closedNotice, type SpeciesOption } from "./SlotForm";

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
  loading: () => <div className="absolute inset-0 animate-pulse bg-emerald-50" />,
});

type Selection = { kind: "new"; lat: number; lng: number } | { kind: "edit"; id: string } | null;
/** delete: slot without history · close: hide from map, keep history · permanent: erase with history. */
type RemoveAction = "delete" | "close" | "permanent";

const STATUS_STYLES: Record<AdminSlot["status"], string> = {
  OPEN: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  FULL: "bg-amber-50 text-amber-800 ring-amber-200",
  CLOSED: "bg-slate-100 text-slate-600 ring-slate-200",
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

  // Desktop height = viewport − 4rem app header − 2.75rem admin tabs.
  return (
    <div className="flex flex-1 flex-col lg:h-[calc(100vh-6.75rem)] lg:flex-row">
      {/* Mobile: fixed 55vh. Desktop: stretches to the row's height (h-auto + flex stretch);
          percentage heights don't resolve here, so the map is absolutely positioned to fill it. */}
      <div className="relative h-[55vh] min-h-[320px] lg:h-auto lg:min-h-0 lg:flex-1">
        <AdminSlotMap
          slots={slots}
          draft={draft}
          selectedId={selectedSlot?.id ?? null}
          onMapClick={(lat, lng) => setSelection({ kind: "new", lat, lng })}
          onSelectSlot={(id) => setSelection({ kind: "edit", id })}
        />
      </div>

      <aside className="bg-white lg:w-[26rem] lg:overflow-y-auto lg:border-l lg:border-slate-200">
        {selection && (draft || selectedSlot) ? (
          <div className="p-4">
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
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="space-y-1 border-b border-slate-100 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Planting slots ({slots.length})</p>
              <p>Click the map to drop a pin and add a slot. Click a marker or “Edit” to change one.</p>
              <ul className="flex flex-wrap gap-3 pt-1 text-xs">
                <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-700" />Open</li>
                <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Full</li>
                <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-500" />Closed</li>
              </ul>
            </div>

            {listError && (
              <p role="alert" className="mx-4 mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">
                {listError}
              </p>
            )}
            {notice && (
              <p role="status" className="mx-4 mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
                {notice}
              </p>
            )}

            {slots.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">No slots yet — drop a pin on the map to add one.</p>
            ) : (
              <ul className="eq-stagger divide-y divide-slate-100">
                {slots.map((slot) => {
                  const hasHistory = slot.totalQuests > 0;
                  const asking = confirm?.id === slot.id ? confirm.action : null;
                  const busy = busyId === slot.id;
                  const btn = "rounded-md border border-slate-200 px-3 py-1 text-xs font-medium";
                  return (
                    <li key={slot.id} className="space-y-2 px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{slot.requiredPlantType}</p>
                          <p className="truncate text-xs text-slate-500">
                            {slot.barangay && `${slot.barangay}, `}
                            {slot.city}, {slot.province}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${STATUS_STYLES[slot.status]}`}>
                          {slot.status.toLowerCase()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {slot.activeQuests}/{slot.maxParticipants} planters · goal {slot.questGoal} plant{slot.questGoal === 1 ? "" : "s"}/quest · {slot.pointsPerPlant} pts/plant
                        {hasHistory && ` · ${slot.totalQuests} quest(s) in history`}
                      </p>

                      {asking === "permanent" ? (
                        <div role="alertdialog" aria-label="Delete slot permanently" className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
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
                              className="mt-0.5 h-4 w-4 accent-red-600"
                            />
                            I understand this slot can&apos;t be restored.
                          </label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => remove(slot, "permanent")}
                              disabled={!acknowledged || busy}
                              className="rounded-md bg-red-600 px-3 py-1 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {busy ? "Deleting…" : "Delete permanently"}
                            </button>
                            <button onClick={() => setConfirm(null)} className="rounded-md px-3 py-1 hover:bg-red-100">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : asking ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">
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
                          <button onClick={() => setConfirm(null)} className="rounded-md px-2.5 py-1 text-red-800 hover:bg-red-100">
                            Keep
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setSelection({ kind: "edit", id: slot.id })}
                            className={`${btn} text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800`}
                          >
                            Edit
                          </button>
                          {hasHistory ? (
                            <>
                              {slot.status !== "CLOSED" && (
                                <button
                                  onClick={() => ask(slot.id, "close")}
                                  title="Hide from the map and keep its planting history"
                                  className={`${btn} text-slate-700 hover:border-slate-300 hover:bg-slate-50`}
                                >
                                  Close
                                </button>
                              )}
                              <button
                                onClick={() => ask(slot.id, "permanent")}
                                className={`${btn} text-red-700 hover:border-red-300 hover:bg-red-50`}
                              >
                                Delete permanently
                              </button>
                            </>
                          ) : (
                            <button onClick={() => ask(slot.id, "delete")} className={`${btn} text-red-700 hover:border-red-300 hover:bg-red-50`}>
                              Delete
                            </button>
                          )}
                        </div>
                      )}
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
