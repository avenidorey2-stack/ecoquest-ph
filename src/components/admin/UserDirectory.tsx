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
          className="min-w-0 flex-1 rounded-lg border border-line-strong bg-card px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-400/20"
        />
        {!q && groups.length > 0 && (
          <button
            type="button"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map(groupKey)))}
            className="min-h-11 rounded-lg border border-line-strong bg-card px-3 text-sm text-ink-2 hover:bg-card-2"
          >
            {allCollapsed ? "Expand All" : "Collapse All"}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-3">
          {q ? `No users match “${query.trim()}”.` : "No users have signed up yet."}
        </p>
      ) : (
        <ul className="eq-stagger space-y-3">
          {visible.map((g) => {
            const key = groupKey(g);
            // Searching always shows the matches, whatever was collapsed before.
            const open = !!q || !collapsed.has(key);
            const total = groups.find((x) => groupKey(x) === key)?.users.length ?? g.users.length;
            return (
              <li key={key} className="eq-panel overflow-hidden rounded-2xl border border-line/80 bg-card shadow-sm">
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  disabled={!!q}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-card-2 disabled:cursor-default disabled:hover:bg-white/5"
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ${
                      g.cityCode ? "bg-emerald-400/10 text-emerald-400 ring-emerald-400/20" : "bg-card-2 text-ink-3 ring-line"
                    }`}
                  >
                    <PinIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{g.city ?? "No Location Yet"}</span>
                    <span className="block truncate text-xs text-ink-3">
                      {g.cityCode ? [g.province, g.region].filter(Boolean).join(" · ") : "Haven't set their city or town yet"}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-card-2 px-2.5 py-1 text-xs font-semibold text-ink-2">
                    {q && g.users.length !== total ? `${g.users.length} of ${total}` : total}{" "}
                    {total === 1 ? "user" : "users"}
                  </span>
                  {!q && (
                    <ChevronRightIcon
                      className={`h-4 w-4 shrink-0 text-ink-4 transition-transform ${open ? "rotate-90" : ""}`}
                    />
                  )}
                </button>
                {open && (
                  <ul className="divide-y divide-line border-t border-line">
                    {g.users.map((u) => {
                      const label = u.name ?? "Unnamed Planter";
                      return (
                        <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                          {u.image ? (
                            // eslint-disable-next-line @next/next/no-img-element -- uploaded avatar or OAuth photo
                            <img src={u.image} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                          ) : (
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-400/15 font-semibold text-emerald-400">
                              {(u.name ?? u.email ?? "?").slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="flex min-w-0 items-center gap-2">
                              <Link href={`/planters/${u.id}`} className="eq-hit relative truncate font-medium text-ink hover:text-emerald-400 hover:underline">
                                {label}
                              </Link>
                              {!u.verified && (
                                <span className="shrink-0 rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-400/30">
                                  Unverified
                                </span>
                              )}
                            </p>
                            {u.email && <p className="truncate text-xs text-ink-3">{u.email}</p>}
                          </div>
                          <div className="shrink-0 text-right text-xs text-ink-3">
                            <p className="font-medium text-ink-2">
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
