"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import VoucherArt from "@/components/rewards/VoucherArt";
import { MAX_COST_POINTS, MAX_VALUE_PESOS, parseWholeNumber } from "@/lib/voucher";

type RewardType = "EWALLET_CASH" | "VOUCHER";

export type AdminReward = {
  id: string;
  rewardType: RewardType;
  brand: string;
  costPoints: number;
  valuePesos: number;
  isActive: boolean;
  redemptions: number;
};

const TYPE_LABELS: Record<RewardType, string> = { EWALLET_CASH: "E-wallet cash", VOUCHER: "Voucher" };

const VALUE_HINT = `Value must be a whole number from 1 to ${MAX_VALUE_PESOS.toLocaleString("en-PH")}.`;
const COST_HINT = `Cost must be a whole number from 1 to ${MAX_COST_POINTS.toLocaleString("en-PH")}.`;

async function send(url: string, method: "POST" | "PATCH", body: object) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.ok ? null : ((await res.json().catch(() => ({}))).error ?? "Save failed.");
}

function RewardRow({ reward }: { reward: AdminReward }) {
  const router = useRouter();
  const [cost, setCost] = useState(String(reward.costPoints));
  const [value, setValue] = useState(String(reward.valuePesos));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = cost !== String(reward.costPoints) || value !== String(reward.valuePesos);
  const valuePesos = parseWholeNumber(value, 1, MAX_VALUE_PESOS);
  const costPoints = parseWholeNumber(cost, 1, MAX_COST_POINTS);
  const hint = valuePesos === null ? VALUE_HINT : costPoints === null ? COST_HINT : null;

  async function save(patch: object) {
    setBusy(true);
    setError(await send(`/api/admin/rewards/${reward.id}`, "PATCH", patch));
    setBusy(false);
    router.refresh();
  }

  const num = "w-24 rounded border border-line bg-card-2 px-2 py-1 text-right";
  return (
    <tr className={reward.isActive ? "" : "bg-card-2 text-ink-3"}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-3">
          {/* Live: shows the value being typed, exactly as planters will see it. The wrapper gives
              the table a width to measure (the art's container sizing reports none). */}
          <div className="w-36 shrink-0">
            <VoucherArt
              brand={reward.brand}
              valuePesos={valuePesos ?? 0}
              isCash={reward.rewardType === "EWALLET_CASH"}
              className={`rounded-xl ${reward.isActive ? "" : "opacity-50 grayscale"}`}
            />
          </div>
          <div className="whitespace-nowrap">
            <p className="font-medium">{reward.brand}</p>
            <p className="text-xs text-ink-3">{TYPE_LABELS[reward.rewardType]}</p>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        ₱{" "}
        <input
          className={num}
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_VALUE_PESOS}
          step={1}
          aria-label={`${reward.brand} value in pesos`}
          aria-invalid={valuePesos === null}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <input
          className={num}
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_COST_POINTS}
          step={1}
          aria-label={`${reward.brand} cost in points`}
          aria-invalid={costPoints === null}
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />{" "}
        pts
      </td>
      <td className="px-3 py-2 text-center">{reward.redemptions}</td>
      <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
        {dirty && (
          <button
            disabled={busy || hint !== null}
            onClick={() => save({ costPoints, valuePesos })}
            className="rounded bg-emerald-400 px-3 py-1 text-emerald-950 pointer-coarse:min-h-11 disabled:opacity-50"
          >
            Save
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => save({ isActive: !reward.isActive })}
          className="rounded border border-line px-3 py-1 hover:bg-card-2 pointer-coarse:min-h-11 disabled:opacity-50"
        >
          {reward.isActive ? "Hide" : "Show"}
        </button>
        {dirty && hint && <p className="mt-1 whitespace-normal text-xs text-amber-300">{hint}</p>}
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </td>
    </tr>
  );
}

function NewRewardForm({ brands }: { brands: Record<RewardType, readonly string[]> }) {
  const router = useRouter();
  const [rewardType, setRewardType] = useState<RewardType>("EWALLET_CASH");
  const [brand, setBrand] = useState(brands.EWALLET_CASH[0]);
  const [value, setValue] = useState("50");
  const [cost, setCost] = useState("500");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valuePesos = parseWholeNumber(value, 1, MAX_VALUE_PESOS);
  const costPoints = parseWholeNumber(cost, 1, MAX_COST_POINTS);
  const hint = valuePesos === null ? VALUE_HINT : costPoints === null ? COST_HINT : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (hint) return;
    setBusy(true);
    const err = await send("/api/admin/rewards", "POST", { rewardType, brand, valuePesos, costPoints });
    setBusy(false);
    setError(err);
    if (!err) router.refresh();
  }

  const field = "mt-1 block rounded border border-line bg-card-2 px-2 py-1.5 text-sm";
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-line bg-card p-4 text-sm sm:flex-row sm:items-start">
      <div className="w-full max-w-xs shrink-0">
        <VoucherArt brand={brand} valuePesos={valuePesos ?? 0} isCash={rewardType === "EWALLET_CASH"} />
        <p className="mt-1.5 text-center text-xs text-ink-3">Preview — planters see exactly this</p>
      </div>
      <div className="flex flex-1 flex-wrap items-end gap-3">
        <label>
          Type
          <select
            className={field}
            value={rewardType}
            onChange={(e) => {
              const type = e.target.value as RewardType;
              setRewardType(type);
              setBrand(brands[type][0]);
            }}
          >
            {(Object.keys(TYPE_LABELS) as RewardType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Brand
          <select className={field} value={brand} onChange={(e) => setBrand(e.target.value)}>
            {brands[rewardType].map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label>
          Value (₱)
          <input
            className={`${field} w-28`}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_VALUE_PESOS}
            step={1}
            aria-invalid={valuePesos === null}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </label>
        <label>
          Cost (points)
          <input
            className={`${field} w-28`}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_COST_POINTS}
            step={1}
            aria-invalid={costPoints === null}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            required
          />
        </label>
        <button disabled={busy || hint !== null} className="min-h-11 rounded-lg bg-emerald-400 px-4 font-bold text-emerald-950 disabled:opacity-50">
          Add reward
        </button>
        {hint && <p className="w-full text-amber-300">{hint}</p>}
        {error && <p className="w-full text-red-400">{error}</p>}
      </div>
    </form>
  );
}

export default function RewardCatalog({
  rewards,
  brands,
}: {
  rewards: AdminReward[];
  brands: Record<RewardType, readonly string[]>;
}) {
  return (
    <div className="space-y-4">
      <NewRewardForm brands={brands} />
      {rewards.length === 0 ? (
        <p className="text-sm text-ink-3">No rewards yet. Add one above.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-card-2 text-left text-xs uppercase text-ink-3">
              <tr>
                <th className="px-3 py-2">Reward</th>
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2">Cost</th>
                <th className="px-3 py-2 text-center">Redeemed</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rewards.map((r) => (
                <RewardRow key={`${r.id}-${r.costPoints}-${r.valuePesos}`} reward={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
