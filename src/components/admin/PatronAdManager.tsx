"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type AdminPatronAd = {
  id: string;
  companyName: string;
  imageUrl: string;
  targetUrl: string;
  isActive: boolean;
};

async function send(url: string, method: "POST" | "PATCH" | "DELETE", body?: object) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.ok ? null : ((await res.json().catch(() => ({}))).error ?? "Request failed.");
}

function AdForm({ ad, onDone }: { ad?: AdminPatronAd; onDone: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState({
    companyName: ad?.companyName ?? "",
    imageUrl: ad?.imageUrl ?? "",
    targetUrl: ad?.targetUrl ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = ad
      ? await send(`/api/admin/patron-ads/${ad.id}`, "PATCH", values)
      : await send("/api/admin/patron-ads", "POST", values);
    setBusy(false);
    setError(err);
    if (!err) {
      router.refresh();
      onDone();
    }
  }

  const input = "mt-1 block w-full rounded border px-2 py-1.5 text-sm";
  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-sm">
      <label className="block">
        Company name
        <input className={input} value={values.companyName} maxLength={80} required
          onChange={(e) => setValues({ ...values, companyName: e.target.value })} />
      </label>
      <label className="block">
        Banner image URL <span className="text-xs text-gray-500">(https, wide image ~ 4:1, e.g. 1200×300)</span>
        <input className={input} type="url" value={values.imageUrl} required placeholder="https://…"
          onChange={(e) => setValues({ ...values, imageUrl: e.target.value })} />
      </label>
      <label className="block">
        Link (where the banner goes)
        <input className={input} type="url" value={values.targetUrl} required placeholder="https://…"
          onChange={(e) => setValues({ ...values, targetUrl: e.target.value })} />
      </label>
      {values.imageUrl.startsWith("https://") && (
        // eslint-disable-next-line @next/next/no-img-element -- admin preview of an external banner
        <img src={values.imageUrl} alt="Preview" className="aspect-[4/1] w-full rounded-lg border object-cover" />
      )}
      {error && <p className="text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="rounded bg-green-600 px-4 py-1.5 font-medium text-white disabled:opacity-50">
          {ad ? "Save" : "Add banner"}
        </button>
        {ad && (
          <button type="button" onClick={onDone} className="rounded px-4 py-1.5 text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function AdCard({ ad }: { ad: AdminPatronAd }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(method: "PATCH" | "DELETE", body?: object) {
    if (method === "DELETE" && !confirm(`Delete the ${ad.companyName} banner?`)) return;
    setBusy(true);
    setError(await send(`/api/admin/patron-ads/${ad.id}`, method, body));
    setBusy(false);
    router.refresh();
  }

  return (
    <li className={`space-y-3 rounded-xl border bg-white p-4 ${ad.isActive ? "" : "opacity-60"}`}>
      {editing ? (
        <AdForm ad={ad} onDone={() => setEditing(false)} />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- external sponsor banner */}
          <img src={ad.imageUrl} alt={ad.companyName} className="aspect-[4/1] w-full rounded-lg border object-cover" />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <p className="font-medium">
                {ad.companyName}{" "}
                <span className={`ml-1 rounded px-1.5 py-0.5 text-xs ${ad.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                  {ad.isActive ? "Live" : "Paused"}
                </span>
              </p>
              <a href={ad.targetUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-blue-700">
                {ad.targetUrl}
              </a>
            </div>
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => setEditing(true)} className="rounded border px-3 py-1 hover:bg-gray-50">
                Edit
              </button>
              <button disabled={busy} onClick={() => act("PATCH", { isActive: !ad.isActive })} className="rounded border px-3 py-1 hover:bg-gray-50">
                {ad.isActive ? "Pause" : "Go live"}
              </button>
              <button disabled={busy} onClick={() => act("DELETE")} className="rounded px-3 py-1 text-red-700 hover:bg-red-50">
                Delete
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </>
      )}
    </li>
  );
}

export default function PatronAdManager({ ads }: { ads: AdminPatronAd[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-4">
      {adding ? (
        <div className="rounded-xl border bg-white p-4">
          <AdForm onDone={() => setAdding(false)} />
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white">
          + New banner
        </button>
      )}
      {ads.length === 0 ? (
        <p className="text-sm text-gray-500">No patron banners yet.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {ads.map((ad) => (
            <AdCard key={`${ad.id}-${ad.isActive}-${ad.imageUrl}`} ad={ad} />
          ))}
        </ul>
      )}
    </div>
  );
}
