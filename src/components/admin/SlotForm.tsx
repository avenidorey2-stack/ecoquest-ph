"use client";

import { useEffect, useState } from "react";
import LocationPicker, { type PlaceCodes } from "@/components/location/LocationPicker";
import type { PsgcRegion } from "@/lib/psgc";
import { isInsidePhilippines } from "@/lib/geo";
import { DEFAULT_MAX_PARTICIPANTS, DEFAULT_QUEST_GOAL, MAX_QUEST_GOAL, MAX_SLOT_PARTICIPANTS } from "@/lib/slot-limits";
import type { AdminSlot } from "./SlotManager";

export type SpeciesOption = { id: string; name: string; category: string };

type Values = {
  /** Catalogue species id; "" keeps a legacy custom species name unchanged. */
  speciesId: string;
  pointsPerPlant: string;
  maxParticipants: string;
  questGoal: string;
  status: AdminSlot["status"];
};


type DetectedPlace = PlaceCodes & { region: string; province: string; city: string };
type Located = { place: DetectedPlace | null; osmName: string | null; failed?: boolean };
const MAX_BARANGAY_LENGTH = 100;

const COORD_LOOKUP_DELAY_MS = 350;
const fmtCoord = (n: number | undefined) => (n === undefined ? "" : n.toFixed(6));
function parseCoord(text: string) {
  if (!text.trim()) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export default function SlotForm({
  regions,
  species,
  slot,
  draft,
  onDraftChange,
  onSaved,
  onCancel,
}: {
  regions: PsgcRegion[];
  species: SpeciesOption[];
  /** Existing slot to edit, or null when creating from `draft`. */
  slot: AdminSlot | null;
  draft: { lat: number; lng: number } | null;
  /** New slots: called when the admin types valid coordinates, to move the pin. */
  onDraftChange?: (lat: number, lng: number) => void;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isNew = !slot;
  const [values, setValues] = useState<Values>({
    speciesId: slot?.speciesId ?? "",
    pointsPerPlant: String(slot?.pointsPerPlant ?? 10),
    maxParticipants: String(slot?.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS),
    questGoal: String(slot?.questGoal ?? DEFAULT_QUEST_GOAL),
    status: slot?.status ?? "OPEN",
  });
  const [cityCode, setCityCode] = useState<string | null>(slot?.cityCode ?? null);
  const [barangay, setBarangay] = useState(slot?.barangay ?? "");
  // For new pins: the reverse-geocoded PSGC place (null until looked up).
  const [located, setLocated] = useState<Located | null>(null);
  // New pins show the detected place as a summary; "Change" switches to the manual picker.
  const [manualPlace, setManualPlace] = useState(false);
  const [lookupNonce, setLookupNonce] = useState(0); // bump to retry a failed lookup
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const lat = draft?.lat;
  const lng = draft?.lng;
  useEffect(() => {
    if (!isNew || lat === undefined || lng === undefined) return;
    let cancelled = false;
    // Debounced so typing coordinates doesn't fire a lookup per keystroke.
    const timer = setTimeout(() => {
      setLocated(null);
      fetch(`/api/admin/geo/reverse?lat=${lat}&lng=${lng}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data) => {
          if (cancelled) return;
          // Auto-fill everything the pin tells us: region/province/city (PSGC) and barangay.
          setLocated({ place: data?.place ?? null, osmName: data?.osm?.city || null });
          setCityCode(data?.place?.cityCode ?? null);
          setBarangay(data?.barangay ?? "");
          setManualPlace(false);
        })
        .catch(() => !cancelled && setLocated({ place: null, osmName: null, failed: true }));
    }, COORD_LOOKUP_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isNew, lat, lng, lookupNonce]);

  // Latitude/longitude inputs for a new pin. They follow map clicks (`draft`); typing valid
  // coordinates inside the Philippines moves the pin via onDraftChange.
  const draftKey = isNew ? `${lat},${lng}` : "";
  const [coordText, setCoordText] = useState(() => ({ key: draftKey, lat: fmtCoord(lat), lng: fmtCoord(lng) }));
  if (isNew && coordText.key !== draftKey) {
    // The pin moved on the map: adopt its coordinates (state derived from props during render).
    setCoordText({ key: draftKey, lat: fmtCoord(lat), lng: fmtCoord(lng) });
  }
  const typedLat = parseCoord(coordText.lat);
  const typedLng = parseCoord(coordText.lng);
  const coordsValid = typedLat !== null && typedLng !== null && isInsidePhilippines(typedLat, typedLng);

  function changeCoord(field: "lat" | "lng", value: string) {
    const next = { ...coordText, [field]: value };
    const nLat = parseCoord(next.lat);
    const nLng = parseCoord(next.lng);
    if (nLat !== null && nLng !== null && isInsidePhilippines(nLat, nLng) && (nLat !== lat || nLng !== lng)) {
      // Key the text to the coordinates we're about to receive back, so it isn't reformatted mid-typing.
      setCoordText({ ...next, key: `${nLat},${nLng}` });
      onDraftChange?.(nLat, nLng);
    } else {
      setCoordText(next);
    }
  }

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isNew && !coordsValid) {
      setError("Enter a latitude and longitude inside the Philippines, or click the map.");
      return;
    }
    if (!cityCode) {
      setError("Choose the slot's city/municipality.");
      return;
    }
    if (isNew && !values.speciesId) {
      setError("Choose the tree species for this slot.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      cityCode,
      ...(values.speciesId ? { speciesId: values.speciesId } : {}),
      pointsPerPlant: Number(values.pointsPerPlant),
      maxParticipants: Number(values.maxParticipants),
      questGoal: Number(values.questGoal),
      barangay: barangay.trim() || null,
      ...(isNew ? { latitude: lat, longitude: lng } : { status: values.status }),
    };
    const res = await fetch(isNew ? "/api/admin/slots" : `/api/admin/slots/${slot.id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Save failed.");
      return;
    }
    onSaved();
  }

  const input = "mt-1 block w-full rounded border px-2 py-1.5 text-sm";
  const locating = isNew && !located;
  const pickerInitial = isNew
    ? (located?.place ?? null)
    : { regionCode: slot.regionCode, provinceCode: slot.provinceCode, cityCode: slot.cityCode };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <h2 className="font-semibold">{isNew ? "Add planting slot" : "Edit slot rules"}</h2>
        {isNew ? (
          <p className="text-xs text-gray-500">Pin captured from the map — adjust the coordinates if needed.</p>
        ) : (
          <p className="text-xs text-gray-500">
            {slot.latitude.toFixed(5)}, {slot.longitude.toFixed(5)} · {slot.activeQuests} active quest(s)
          </p>
        )}
      </div>

      {isNew && (
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">Coordinates</legend>
          <label className="block text-sm">
            Latitude
            <input
              className={`${input} font-mono`}
              inputMode="decimal"
              value={coordText.lat}
              onChange={(e) => changeCoord("lat", e.target.value)}
              aria-invalid={!coordsValid}
              required
            />
          </label>
          <label className="block text-sm">
            Longitude
            <input
              className={`${input} font-mono`}
              inputMode="decimal"
              value={coordText.lng}
              onChange={(e) => changeCoord("lng", e.target.value)}
              aria-invalid={!coordsValid}
              required
            />
          </label>
          {!coordsValid && (
            <p className="col-span-2 text-xs text-red-600">Coordinates must be numbers inside the Philippines.</p>
          )}
        </fieldset>
      )}

      {locating ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3" aria-busy="true">
          <p className="text-xs font-semibold text-slate-600">📍 Detecting location from the pin…</p>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="block h-4 animate-pulse rounded bg-slate-200" style={{ width: `${85 - i * 12}%` }} />
          ))}
        </div>
      ) : isNew && located?.place && !manualPlace ? (
        <section aria-label="Detected location" className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-emerald-800">📍 Auto-filled from pin</p>
            <button
              type="button"
              onClick={() => setManualPlace(true)}
              className="text-xs font-medium text-emerald-700 underline-offset-2 hover:underline"
            >
              Change
            </button>
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-slate-500">Region</dt>
            <dd className="font-medium text-slate-900">{located.place.region}</dd>
            <dt className="text-slate-500">Province</dt>
            <dd className="font-medium text-slate-900">{located.place.province}</dd>
            <dt className="text-slate-500">City / Mun.</dt>
            <dd className="font-medium text-slate-900">{located.place.city}</dd>
          </dl>
        </section>
      ) : (
        <>
          {isNew && !located?.place && (
            <p className="text-xs text-amber-700">
              {located?.failed
                ? "Couldn't reach the location service. "
                : `Couldn't match this pin to a PSGC city${located?.osmName ? ` (map says “${located.osmName}”)` : ""}. `}
              Please choose it below
              {located?.failed && (
                <>
                  {" or "}
                  <button type="button" onClick={() => setLookupNonce((n) => n + 1)} className="font-medium underline">
                    try again
                  </button>
                </>
              )}
              .
            </p>
          )}
          {/* Remount when the lookup finishes so the picker starts from the matched place. */}
          <LocationPicker
            key={pickerInitial?.cityCode ?? "none"}
            regions={regions}
            initial={pickerInitial}
            onChange={setCityCode}
          />
        </>
      )}

      {!locating && (
        <label className="block text-sm">
          Barangay <span className="text-xs text-gray-500">(optional)</span>
          <input
            className={input}
            value={barangay}
            onChange={(e) => setBarangay(e.target.value)}
            maxLength={MAX_BARANGAY_LENGTH}
            placeholder="e.g. Poblacion"
          />
          {isNew && located?.place && (
            <span className="text-xs text-gray-500">Detected from OpenStreetMap. Double-check it.</span>
          )}
        </label>
      )}

      <label className="block text-sm">
        Tree species
        <select
          className={input}
          value={values.speciesId}
          onChange={(e) => set("speciesId", e.target.value)}
          required={isNew}
        >
          <option value="">{slot && !slot.speciesId ? `${slot.requiredPlantType} (custom — keep)` : "Choose a species…"}</option>
          {[...new Set(species.map((s) => s.category))].map((category) => (
            <optgroup key={category} label={category}>
              {species
                .filter((s) => s.category === category)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <span className="text-xs text-gray-500">Approved plantings count toward this species in the Tree Directory.</span>
      </label>

      <label className="block text-sm">
        Points per plant
        <input
          className={input}
          type="number"
          min={1}
          max={10000}
          value={values.pointsPerPlant}
          onChange={(e) => set("pointsPerPlant", e.target.value)}
          required
        />
      </label>

      <label className="block text-sm">
        Plants per quest (goal)
        <input
          className={input}
          type="number"
          min={1}
          max={MAX_QUEST_GOAL}
          step={1}
          value={values.questGoal}
          onChange={(e) => set("questGoal", e.target.value)}
          required
        />
        <span className="text-xs text-gray-500">
          Approved plants needed to complete one quest. Planters can submit proof in several batches.
          {!isNew && " Applies to quests claimed after saving."}
        </span>
      </label>

      <label className="block text-sm">
        Max participants
        <input
          className={input}
          type="number"
          min={1}
          max={MAX_SLOT_PARTICIPANTS}
          step={1}
          value={values.maxParticipants}
          onChange={(e) => set("maxParticipants", e.target.value)}
          required
        />
        <span className="text-xs text-gray-500">
          Planters who can work this slot at once (active or awaiting review).
          {!isNew && slot.activeQuests > 0 && ` Currently ${slot.activeQuests}.`}
        </span>
      </label>

      {!isNew && (
        <label className="block text-sm">
          Status
          <select className={input} value={values.status} onChange={(e) => set("status", e.target.value as Values["status"])}>
            <option value="OPEN">Open</option>
            <option value="FULL">Full (no new claims)</option>
            <option value="CLOSED">Closed (hidden from map)</option>
          </select>
        </label>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || locating}
          className="rounded bg-green-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : isNew ? "Create slot" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} className="rounded px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
          Cancel
        </button>
      </div>
    </form>
  );
}
