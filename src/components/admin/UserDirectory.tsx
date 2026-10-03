"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { LocationGroup } from "@/lib/admin-users";
import { formatDate } from "@/lib/format";
import { ChevronRightIcon, PinIcon } from "@/components/ui/icons";

const groupKey = (g: LocationGroup) => g.cityCode ?? "none";
const has = (value: string | null, q: string) => !!value && value.toLowerCase().includes(q);

export default function UserDirectory({ groups }: { groups: LocationGroup[] }) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const q = query.trim().toLowerCase();

  // A place match keeps the whole city; otherwise only the users whose name or email match.
  const visible = useMemo(() => {
    if (!q) return groups;
    return groups
      .map((g) =>
        [g.city, g.province, g.region].some((v) => has(v, q))
          ? g
          : { ...g, users: g.users.filter((u) => has(u.name, q) || has(u.email, q)) },
      )
      .filter((g) => g.users.length > 0);
  }, [groups, q]);

  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(groupKey(g)));
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email or place"
          aria-label="Search users"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />
        {!q && groups.length > 0 && (
          <button
            type="button"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map(groupKey)))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {allCollapsed ? "Expand all" : "Collapse all"}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          {q ? `No users match “${query.trim()}”.` : "No users have signed up yet."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((g) => {
            const key = groupKey(g);
            // Searching always shows the matches, whatever was collapsed before.
            const open = !!q || !collapsed.has(key);
            const total = groups.find((x) => groupKey(x) === key)?.users.length ?? g.users.length;
            return (
              <li key={key} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  disabled={!!q}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-white"
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ${
                      g.cityCode ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-slate-100 text-slate-500 ring-slate-200"
                    }`}
                  >
                    <PinIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900">{g.city ?? "No location yet"}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {g.cityCode ? [g.province, g.region].filter(Boolean).join(" · ") : "Haven't set their city or town yet"}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {q && g.users.length !== total ? `${g.users.length} of ${total}` : total}{" "}
                    {total === 1 ? "user" : "users"}
                  </span>
                  {!q && (
                    <ChevronRightIcon
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
                    />
                  )}
                </button>
                {open && (
                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {g.users.map((u) => {
                      const label = u.name ?? "Unnamed planter";
                      return (
                        <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                          {u.image ? (
                            // eslint-disable-next-line @next/next/no-img-element -- uploaded avatar or OAuth photo
                            <img src={u.image} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                          ) : (
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green-100 font-semibold text-green-700">
                              {(u.name ?? u.email ?? "?").slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="flex min-w-0 items-center gap-2">
                              <Link href={`/planters/${u.id}`} className="truncate font-medium text-slate-900 hover:text-emerald-700 hover:underline">
                                {label}
                              </Link>
                              {!u.verified && (
                                <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                                  Unverified
                                </span>
                              )}
                            </p>
                            {u.email && <p className="truncate text-xs text-slate-500">{u.email}</p>}
                          </div>
                          <div className="shrink-0 text-right text-xs text-slate-500">
                            <p className="font-medium text-slate-700">
                              {u.totalPlants.toLocaleString("en-PH")} {u.totalPlants === 1 ? "tree" : "trees"}
                            </p>
                            <p>Joined {formatDate(u.joinedAt)}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
