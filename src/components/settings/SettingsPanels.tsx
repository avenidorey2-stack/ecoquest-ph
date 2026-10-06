"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOutAction } from "@/app/actions/auth";
import { Avatar } from "@/components/social/UserSearch";

type Visibility = "EVERYONE" | "FRIENDS" | "ONLY_ME";
type Toggles = { notifyFriendRequests: boolean; notifyLikes: boolean; notifyComments: boolean };
type Status = { kind: "ok" | "error"; text: string } | null;

const card = "eq-panel overflow-hidden rounded-2xl border border-line/80 bg-card shadow-sm";
const head = "border-b border-line px-5 py-3.5";
const title = "text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3";
const input =
  "mt-1.5 block w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-base text-ink outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-400/20 sm:text-sm";
const primary =
  "min-h-11 rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-50";

export function Card({ heading, children, id }: { heading: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className={card} aria-label={heading}>
      <header className={head}>
        <h2 className={title}>{heading}</h2>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function StatusText({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p role="status" className={`text-sm ${status.kind === "ok" ? "text-emerald-400" : "text-rose-300"}`}>
      {status.text}
    </p>
  );
}

async function patch(body: object) {
  const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't save. Check your connection.");
  return data;
}

const errorText = (e: unknown) => (e instanceof Error && e.message !== "Failed to fetch" ? e.message : "No connection. Try again.");

const VISIBILITY: { value: Visibility; label: string; hint: string }[] = [
  { value: "EVERYONE", label: "Everyone", hint: "Any EcoQuest planter can see, like and comment on your planting photos." },
  { value: "FRIENDS", label: "Friends Only", hint: "Only planters you've accepted as friends." },
  { value: "ONLY_ME", label: "Only Me", hint: "Your photos stay private. Our team still reviews them." },
];

export function PrivacyPanel({ initial, initialActive }: { initial: Visibility; initialActive: boolean }) {
  const [value, setValue] = useState(initial);
  const [active, setActive] = useState(initialActive);
  const [status, setStatus] = useState<Status>(null);
  async function flipActive() {
    const next = !active;
    setActive(next);
    setStatus(null);
    try {
      await patch({ showActiveStatus: next });
      setStatus({ kind: "ok", text: "Saved." });
    } catch (e) {
      setActive(!next);
      setStatus({ kind: "error", text: errorText(e) });
    }
  }
  async function choose(v: Visibility) {
    const before = value;
    setValue(v);
    setStatus(null);
    try {
      await patch({ photoVisibility: v });
      setStatus({ kind: "ok", text: "Saved." });
    } catch (e) {
      setValue(before);
      setStatus({ kind: "error", text: errorText(e) });
    }
  }
  return (
    <Card heading="Privacy" id="privacy">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-ink-2">Who Can See My Planting Photos</legend>
        {VISIBILITY.map((o) => (
          <label
            key={o.value}
            className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
              value === o.value ? "border-emerald-400/60 bg-emerald-400/10" : "border-line-strong bg-card-2 hover:bg-card-3"
            }`}
          >
            <input type="radio" name="photo-visibility" checked={value === o.value} onChange={() => choose(o.value)} className="mt-1 h-4 w-4 accent-emerald-400" />
            <span>
              <span className="block text-sm font-semibold text-ink">{o.label}</span>
              <span className="block text-xs text-ink-3">{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="mt-4 flex items-center justify-between gap-4 border-t border-line pt-4">
        <span>
          <span className="block text-sm font-semibold text-ink">Show When You&apos;re Active</span>
          <span className="block text-xs text-ink-3">Friends see &ldquo;Active Now&rdquo; or when you were last on, like &ldquo;Active 2h ago&rdquo;.</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label="Show When You're Active"
          onClick={flipActive}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${active ? "bg-emerald-400" : "bg-card-3 ring-1 ring-line-strong"}`}
        >
          <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${active ? "translate-x-5" : ""}`} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <StatusText status={status} />
        <Link href="/privacy" className="ml-auto text-sm font-semibold text-emerald-300 underline-offset-2 hover:underline">
          Read Our Privacy Policy
        </Link>
      </div>
    </Card>
  );
}

const TOGGLES: { key: keyof Toggles; label: string; hint: string }[] = [
  { key: "notifyFriendRequests", label: "Friend Requests", hint: "New requests, and when someone accepts yours." },
  { key: "notifyLikes", label: "Likes", hint: "When someone likes your planting photo." },
  { key: "notifyComments", label: "Comments & Replies", hint: "Comments on your photos and replies to your comments." },
];

export function NotificationsPanel({ initial }: { initial: Toggles }) {
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState<Status>(null);
  async function flip(key: keyof Toggles) {
    const next = !values[key];
    setValues((v) => ({ ...v, [key]: next }));
    setStatus(null);
    try {
      await patch({ [key]: next });
    } catch (e) {
      setValues((v) => ({ ...v, [key]: !next }));
      setStatus({ kind: "error", text: errorText(e) });
    }
  }
  return (
    <Card heading="Notifications">
      <ul className="divide-y divide-line">
        {TOGGLES.map((t) => (
          <li key={t.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <span>
              <span className="block text-sm font-semibold text-ink">{t.label}</span>
              <span className="block text-xs text-ink-3">{t.hint}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={values[t.key]}
              aria-label={t.label}
              onClick={() => flip(t.key)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${values[t.key] ? "bg-emerald-400" : "bg-card-3 ring-1 ring-line-strong"}`}
            >
              <span
                className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${values[t.key] ? "translate-x-5" : ""}`}
              />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-3">Updates about your quests, orders, rewards and reports are always on.</p>
      <div className="mt-2">
        <StatusText status={status} />
      </div>
    </Card>
  );
}

export function PasswordPanel({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [has, setHas] = useState(hasPassword);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) return setStatus({ kind: "error", text: "The new passwords don't match." });
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current: has ? current : undefined, next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't change your password.");
      setCurrent("");
      setNext("");
      setConfirm("");
      setStatus({ kind: "ok", text: has ? "Password changed." : "Password set. You can now sign in with your email too." });
      setHas(true);
    } catch (err) {
      setStatus({ kind: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card heading={has ? "Change Password" : "Set a Password"}>
      {!has && <p className="mb-3 text-sm text-ink-3">You sign in with Google. Set a password to also sign in with your email.</p>}
      <form onSubmit={submit} className="space-y-3">
        {has && (
          <label className="block text-sm font-medium text-ink-2">
            Current Password
            <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
          </label>
        )}
        <div>
          <label className="block text-sm font-medium text-ink-2">
            New Password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-describedby="new-password-hint"
              className={input}
            />
          </label>
          <p id="new-password-hint" className="mt-1 text-xs text-ink-3">
            At least 8 characters.
          </p>
        </div>
        <label className="block text-sm font-medium text-ink-2">
          Confirm New Password
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
        </label>
        <StatusText status={status} />
        <button type="submit" disabled={busy} className={primary}>
          {busy ? "Saving…" : has ? "Change Password" : "Set Password"}
        </button>
      </form>
    </Card>
  );
}

export type BlockedPlanter = { id: string; name: string; image: string | null };

export function BlockedPanel({ initial }: { initial: BlockedPlanter[] }) {
  const [list, setList] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  async function unblock(id: string) {
    setError(null);
    const res = await fetch(`/api/blocks/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setList((l) => l.filter((p) => p.id !== id));
    else setError("Couldn't unblock. Try again.");
  }
  return (
    <Card heading="Blocked Users" id="blocked">
      <p className="mb-3 text-sm text-ink-3">
        People you block can&apos;t find you, see your photos, comment, or send you friend requests — and you won&apos;t see them. Block someone
        from their profile.
      </p>
      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-4 text-center text-sm text-ink-3">You haven&apos;t blocked anyone.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar card={p} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{p.name}</span>
              <button
                type="button"
                onClick={() => unblock(p.id)}
                className="min-h-10 rounded-xl border border-line-strong bg-card-2 px-3 text-sm font-semibold text-ink-2 hover:bg-card-3"
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-300">
          {error}
        </p>
      )}
    </Card>
  );
}

export function DeleteAccountPanel({ hasPassword, canDelete }: { hasPassword: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm, password: hasPassword ? password : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't delete your account.");
      await signOutAction().catch(() => router.replace("/"));
    } catch (err) {
      setStatus({ kind: "error", text: errorText(err) });
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-rose-400/30 bg-rose-500/[0.06]" aria-label="Delete Account">
      <header className="border-b border-rose-400/20 px-5 py-3.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-300">Delete Account</h2>
      </header>
      <div className="space-y-3 p-5 text-sm text-ink-2">
        <p>
          Permanently deletes your account: your points, planting photos, orders and reward history, friends, comments and reports. This
          can&apos;t be undone.
        </p>
        {!canDelete ? (
          <p className="text-ink-3">Team accounts can&apos;t be deleted here.</p>
        ) : !open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-h-11 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 font-semibold text-rose-200 hover:bg-rose-500/20"
          >
            Delete My Account…
          </button>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block font-medium">
              Type DELETE to confirm
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" required className={input} />
            </label>
            {hasPassword && (
              <label className="block font-medium">
                Your Password
                <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
              </label>
            )}
            <StatusText status={status} />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy || confirm !== "DELETE"}
                className="min-h-11 rounded-xl bg-rose-500 px-5 font-bold text-white hover:bg-rose-400 disabled:opacity-40"
              >
                {busy ? "Deleting…" : "Permanently Delete"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-xl border border-line-strong bg-card-2 px-4 font-semibold text-ink-2 hover:bg-card-3">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
