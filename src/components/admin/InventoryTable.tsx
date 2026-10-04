"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type InventoryRow = {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  priceInPoints: number;
  priceInPesos: number;
  stockQuantity: number;
  isActive: boolean;
};

type Draft = { priceInPoints: string; priceInPesos: string; stockQuantity: string; isActive: boolean };

const toDraft = (r: InventoryRow): Draft => ({
  priceInPoints: String(r.priceInPoints),
  priceInPesos: r.priceInPesos.toFixed(2),
  stockQuantity: String(r.stockQuantity),
  isActive: r.isActive,
});

/** Admin inventory: edit points/peso prices, stock and visibility per seedling. */
export default function InventoryTable({ rows }: { rows: InventoryRow[] }) {
  return (
    <div className="eq-panel overflow-x-auto rounded-2xl border border-line/80 bg-card shadow-sm">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-card-2 text-left text-[11px] uppercase tracking-[0.12em] text-ink-3">
          <tr>
            <th className="px-4 py-3 font-semibold">Seedling</th>
            <th className="px-3 py-3 font-semibold">Price (points)</th>
            <th className="px-3 py-3 font-semibold">Price (₱, COD)</th>
            <th className="px-3 py-3 font-semibold">Stock</th>
            <th className="px-3 py-3 font-semibold">In shop</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <InventoryRowEditor key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InventoryRowEditor({ row }: { row: InventoryRow }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(row));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const original = toDraft(row);
  const dirty = (Object.keys(draft) as (keyof Draft)[]).some((k) => draft[k] !== original[k]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setStatus(null);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  async function save() {
    setSaving(true);
    setStatus(null);
    const res = await fetch(`/api/admin/seedlings/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        priceInPoints: Number(draft.priceInPoints),
        // Round to centavos so "12.5" and "12.50" both save cleanly.
        priceInPesos: Math.round(Number(draft.priceInPesos) * 100) / 100,
        stockQuantity: Number(draft.stockQuantity),
        isActive: draft.isActive,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setStatus({ ok: false, text: (res && (await res.json().catch(() => ({}))).error) ?? "Save failed." });
      return;
    }
    setStatus({ ok: true, text: "Saved" });
    router.refresh();
  }

  const input =
    "w-24 rounded-lg border border-line px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

  return (
    <tr className={draft.isActive ? "" : "bg-card-2/60"}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG illustration */}
          <img src={row.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-card-2 object-cover" />
          <div className="min-w-0">
            <p className="font-medium text-ink">{row.name}</p>
            <p className="truncate text-xs text-ink-3">{row.category}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <input
          aria-label={`${row.name} price in points`}
          className={input}
          type="number"
          min={1}
          step={1}
          value={draft.priceInPoints}
          onChange={(e) => set("priceInPoints", e.target.value)}
        />
      </td>
      <td className="px-3 py-3">
        <input
          aria-label={`${row.name} price in pesos`}
          className={input}
          type="number"
          min={0}
          step={0.01}
          value={draft.priceInPesos}
          onChange={(e) => set("priceInPesos", e.target.value)}
        />
      </td>
      <td className="px-3 py-3">
        <input
          aria-label={`${row.name} stock`}
          className={`${input} ${Number(draft.stockQuantity) === 0 ? "border-red-400/30 text-red-300" : ""}`}
          type="number"
          min={0}
          step={1}
          value={draft.stockQuantity}
          onChange={(e) => set("stockQuantity", e.target.value)}
        />
      </td>
      <td className="px-3 py-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-2">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            className="h-4 w-4 rounded border-line-strong accent-emerald-400"
          />
          {draft.isActive ? "Listed" : "Hidden"}
        </label>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {status && (
            <span role="status" className={`text-xs ${status.ok ? "text-emerald-400" : "text-red-400"}`}>
              {status.text}
            </span>
          )}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-card-2 disabled:text-ink-4"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </td>
    </tr>
  );
}
