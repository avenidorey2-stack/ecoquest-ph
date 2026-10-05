"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import LocationPicker, { type PlaceCodes } from "@/components/location/LocationPicker";
import type { PsgcRegion } from "@/lib/psgc";

export default function ProfileForm({
  regions,
  name: initialName,
  place,
  locationLockedUntil,
}: {
  regions: PsgcRegion[];
  name: string;
  place: PlaceCodes | null;
  /** ISO date while the city-change cooldown is active. */
  locationLockedUntil: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [cityCode, setCityCode] = useState<string | null>(place?.cityCode ?? null);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const cityChanged = cityCode !== (place?.cityCode ?? null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cityCode) {
      setStatus({ kind: "error", text: "Choose your city/municipality." });
      return;
    }
    if (cityChanged && place && !confirm("Change your home city? You won't be able to change it again for 30 days.")) {
      return;
    }

    setSaving(true);
    setStatus(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ...(cityChanged ? { cityCode } : {}) }),
    });
    setSaving(false);

    if (!res.ok) {
      setStatus({ kind: "error", text: (await res.json().catch(() => ({}))).error ?? "Save failed." });
      return;
    }
    setStatus({ kind: "ok", text: "Profile saved." });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block text-sm font-medium text-ink-2">
        Display Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          required
          className="mt-1.5 block w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-base text-ink shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-400/20 sm:text-sm"
        />
      </label>

      <div>
        <p className="text-sm font-medium">Home City</p>
        <p className="mb-2 text-xs text-ink-3">
          You can only claim planting slots in this city/municipality. It also sets your local leaderboard.
        </p>
        <LocationPicker
          regions={regions}
          initial={place}
          onChange={setCityCode}
          disabled={!!locationLockedUntil}
        />
        {locationLockedUntil && (
          <p className="mt-2 text-xs text-amber-300">
            You can change your city again on{" "}
            {new Date(locationLockedUntil).toLocaleDateString("en-PH", { dateStyle: "long" })}.
          </p>
        )}
      </div>

      {status && (
        <p className={`text-sm ${status.kind === "ok" ? "text-emerald-400" : "text-red-400"}`} role="status">
          {status.text}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="min-h-11 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-300 motion-safe:active:scale-[0.98] disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save Profile"}
      </button>
    </form>
  );
}
