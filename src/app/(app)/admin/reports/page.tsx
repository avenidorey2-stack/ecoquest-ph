import Link from "next/link";
import { requireAdminPage } from "@/lib/authz";
import { listOpenReportGroups, listResolvedReports, listRestrictedUsers, REPORT_REASONS } from "@/lib/moderation";
import { formatDate, timeAgo } from "@/lib/format";
import ReportDecision, { LiftRestrictionButton } from "@/components/admin/ReportDecision";

export const metadata = { title: "Reports · Admin · EcoQuest PH" };

const ACTION_LABEL = { DISMISSED: "Dismissed", WARNED: "Warned", SUSPENDED: "Suspended", BANNED: "Banned" } as const;
const ACTION_STYLE = {
  DISMISSED: "bg-card-2 text-ink-2 ring-line",
  WARNED: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
  SUSPENDED: "bg-amber-500/15 text-amber-200 ring-amber-500/40",
  BANNED: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
} as const;

type Tab = "open" | "restricted" | "history";

/** Reported planters: decide (dismiss · warn · suspend · ban), lift restrictions, and see past decisions. */
export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireAdminPage();
  const raw = (await searchParams).tab;
  const tab: Tab = raw === "restricted" || raw === "history" ? raw : "open";
  const now = new Date();

  const tabLink = (value: Tab, label: string) => (
    <Link
      href={value === "open" ? "/admin/reports" : `/admin/reports?tab=${value}`}
      aria-current={tab === value ? "page" : undefined}
      className={`min-h-10 rounded-lg px-4 py-2 text-sm font-semibold ${tab === value ? "bg-card-3 text-emerald-300 ring-1 ring-line-strong" : "text-ink-2 hover:text-ink"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Reported Planters</h2>
          <p className="text-sm text-ink-3">Profiles planters reported. Your decision covers all open reports about that planter.</p>
        </div>
        <nav className="flex gap-1 rounded-xl bg-card p-1 ring-1 ring-line" aria-label="Report views">
          {tabLink("open", "Open")}
          {tabLink("restricted", "Restricted")}
          {tabLink("history", "History")}
        </nav>
      </header>

      {tab === "open" && <OpenReports now={now} />}
      {tab === "restricted" && <Restricted now={now} />}
      {tab === "history" && <History />}
    </div>
  );
}

const empty = (text: string) => <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-ink-3">{text}</p>;

async function OpenReports({ now }: { now: Date }) {
  const groups = await listOpenReportGroups();
  if (!groups.length) return empty("No open reports. 🌿");
  return (
    <ul className="space-y-4">
      {groups.map(({ user, reports, pastActions }) => {
        const restricted = !!user.bannedAt || (!!user.suspendedUntil && user.suspendedUntil > now);
        return (
          <li key={user.id} className="eq-panel overflow-hidden rounded-2xl border border-line/80 bg-card">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-400 font-bold text-emerald-950">
                {(user.name ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/planters/${user.id}`} className="block truncate font-semibold text-ink hover:text-emerald-300">
                  {user.name ?? "Unnamed planter"}
                </Link>
                <p className="truncate text-xs text-ink-3">
                  {user.email} · joined {formatDate(user.createdAt)}
                </p>
              </div>
              <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-bold text-rose-300 ring-1 ring-rose-500/30">
                {reports.length} report{reports.length === 1 ? "" : "s"}
              </span>
            </div>

            {(pastActions.length > 0 || restricted) && (
              <p className="border-b border-line bg-amber-400/5 px-5 py-2 text-xs text-amber-200">
                {restricted && (user.bannedAt ? "Banned now. " : `Suspended until ${formatDate(user.suspendedUntil!)}. `)}
                {pastActions.length > 0 &&
                  `Before: ${pastActions.map((p) => `${ACTION_LABEL[p.action].toLowerCase()} ×${p.count}`).join(", ")}.`}
              </p>
            )}

            <ul className="divide-y divide-line">
              {reports.map((r) => (
                <li key={r.id} className="px-5 py-3 text-sm">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-semibold text-ink-2">{REPORT_REASONS[r.reason]}</span>
                    <span className="text-xs text-ink-4">
                      by {r.reporter?.name ?? "a deleted account"} · {timeAgo(r.createdAt, now)}
                    </span>
                  </p>
                  {r.details && <p className="mt-1 whitespace-pre-line text-ink-3">“{r.details}”</p>}
                </li>
              ))}
            </ul>

            <div className="border-t border-line bg-card-2/40 px-5 py-4">
              <ReportDecision userId={user.id} name={user.name ?? "this planter"} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

async function Restricted({ now }: { now: Date }) {
  const users = await listRestrictedUsers(now);
  if (!users.length) return empty("Nobody is suspended or banned.");
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line/80 bg-card">
      {users.map((u) => (
        <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <Link href={`/planters/${u.id}`} className="block truncate text-sm font-semibold text-ink hover:text-emerald-300">
              {u.name ?? "Unnamed planter"}
            </Link>
            <p className="text-xs text-ink-3">
              {u.bannedAt ? `Banned ${formatDate(u.bannedAt)}` : `Suspended until ${formatDate(u.suspendedUntil!)}`}
              {u.moderationReason && ` · “${u.moderationReason}”`}
            </p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${u.bannedAt ? ACTION_STYLE.BANNED : ACTION_STYLE.SUSPENDED}`}>
            {u.bannedAt ? "Banned" : "Suspended"}
          </span>
          <LiftRestrictionButton userId={u.id} name={u.name ?? "this planter"} banned={!!u.bannedAt} />
        </li>
      ))}
    </ul>
  );
}

async function History() {
  const reports = await listResolvedReports();
  if (!reports.length) return empty("No decisions yet.");
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line/80 bg-card">
      {reports.map((r) => (
        <li key={r.id} className="px-5 py-3 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${ACTION_STYLE[r.action!]}`}>{ACTION_LABEL[r.action!]}</span>
            <Link href={`/planters/${r.reported.id}`} className="font-semibold text-ink hover:text-emerald-300">
              {r.reported.name}
            </Link>
            <span className="text-ink-3">· {REPORT_REASONS[r.reason]}</span>
          </p>
          <p className="mt-1 text-xs text-ink-4">
            Reported by {r.reporter?.name ?? "a deleted account"} · decided by {r.resolvedBy?.name ?? "a former admin"}
            {r.resolvedAt && ` on ${formatDate(r.resolvedAt)}`}
            {r.adminNote && ` · note: “${r.adminNote}”`}
          </p>
        </li>
      ))}
    </ul>
  );
}
