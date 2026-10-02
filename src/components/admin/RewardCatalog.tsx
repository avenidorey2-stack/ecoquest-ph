"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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

  async function save(patch: object) {
    setBusy(true);
    setError(await send(`/api/admin/rewards/${reward.id}`, "PATCH", patch));
    setBusy(false);
    router.refresh();
  }

  const num = "w-24 rounded border px-2 py-1 text-right";
  return (
    <tr className={reward.isActive ? "" : "bg-gray-50 text-gray-500"}>
      <td className="px-3 py-2">
        <p className="font-medium">{reward.brand}</p>
        <p className="text-xs text-gray-500">{TYPE_LABELS[reward.rewardType]}</p>
      </td>
      <td className="px-3 py-2">
        ₱ <input className={num} type="number" min={1} value={value} onChange={(e) => setValue(e.target.value)} />
      </td>
      <td className="px-3 py-2">
        <input className={num} type="number" min={1} value={cost} onChange={(e) => setCost(e.target.value)} /> pts
      </td>
      <td className="px-3 py-2 text-center">{reward.redemptions}</td>
      <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
        {dirty && (
          <button
            disabled={busy}
            onClick={() => save({ costPoints: Number(cost), valuePesos: Number(value) })}
            className="rounded bg-green-600 px-3 py-1 text-white disabled:opacity-50"
          >
            Save
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => save({ isActive: !reward.isActive })}
          className="rounded border px-3 py-1 hover:bg-gray-100 disabled:opacity-50"
        >
          {reward.isActive ? "Hide" : "Show"}
        </button>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await send("/api/admin/rewards", "POST", {
      rewardType,
      brand,
      valuePesos: Number(value),
      costPoints: Number(cost),
    });
    setBusy(false);
    setError(err);
    if (!err) router.refresh();
  }

  const field = "mt-1 block rounded border px-2 py-1.5 text-sm";
  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 text-sm">
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
        <input className={`${field} w-24`} type="number" min={1} value={value} onChange={(e) => setValue(e.target.value)} required />
      </label>
      <label>
        Cost (points)
        <input className={`${field} w-28`} type="number" min={1} value={cost} onChange={(e) => setCost(e.target.value)} required />
      </label>
      <button disabled={busy} className="rounded bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50">
        Add reward
      </button>
      {error && <p className="w-full text-red-600">{error}</p>}
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
        <p className="text-sm text-gray-500">No rewards yet. Add one above.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Reward</th>
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2">Cost</th>
                <th className="px-3 py-2 text-center">Redeemed</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
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
