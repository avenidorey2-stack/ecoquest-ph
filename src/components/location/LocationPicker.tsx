"use client";

import { useEffect, useState } from "react";
import type { PsgcProvince, PsgcRegion } from "@/lib/psgc";

export type PlaceCodes = { regionCode: string; provinceCode: string; cityCode: string };

/**
 * Cascading Region → Province → City/Municipality selects backed by PSGC data.
 * Calls onChange with the selected city code, or null while the selection is incomplete.
 */
export default function LocationPicker({
  regions,
  initial,
  onChange,
  disabled = false,
}: {
  regions: PsgcRegion[];
  initial?: PlaceCodes | null;
  onChange: (cityCode: string | null) => void;
  disabled?: boolean;
}) {
  const [regionCode, setRegionCode] = useState(initial?.regionCode ?? "");
  const [provinceCode, setProvinceCode] = useState(initial?.provinceCode ?? "");
  const [cityCode, setCityCode] = useState(initial?.cityCode ?? "");
  const [tree, setTree] = useState<{ regionCode: string; provinces: PsgcProvince[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!regionCode) return;
    let cancelled = false;
    fetch(`/api/psgc/regions/${regionCode}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => !cancelled && setTree({ regionCode, provinces: data.provinces }))
      .catch(() => !cancelled && setError("Couldn't load places. Check your connection and try again."));
    return () => {
      cancelled = true;
    };
  }, [regionCode]);

  const provinces = tree?.regionCode === regionCode ? tree.provinces : null;
  const loading = !!regionCode && !provinces && !error;
  // Regions with a single province (e.g. NCR → Metro Manila) select it implicitly.
  const effectiveProvince = provinceCode || (provinces?.length === 1 ? provinces[0].code : "");
  const cities = provinces?.find((p) => p.code === effectiveProvince)?.cities ?? [];

  const select =
    "mt-1 block w-full rounded border bg-white px-2 py-1.5 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-500";

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <label className="block text-sm">
        Region
        <select
          className={select}
          value={regionCode}
          onChange={(e) => {
            setRegionCode(e.target.value);
            setProvinceCode("");
            setCityCode("");
            setError(null);
            onChange(null);
          }}
          required
        >
          <option value="">Select region…</option>
          {regions.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        Province
        <select
          className={select}
          value={effectiveProvince}
          onChange={(e) => {
            setProvinceCode(e.target.value);
            setCityCode("");
            onChange(null);
          }}
          disabled={!provinces}
          required
        >
          <option value="">{loading ? "Loading…" : "Select province…"}</option>
          {provinces?.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        City / municipality
        <select
          className={select}
          value={cityCode}
          onChange={(e) => {
            setCityCode(e.target.value);
            onChange(e.target.value || null);
          }}
          disabled={!effectiveProvince || cities.length === 0}
          required
        >
          <option value="">Select city/municipality…</option>
          {cities.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </fieldset>
  );
}
