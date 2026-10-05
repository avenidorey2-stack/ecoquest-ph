import Link from "next/link";
import { requireAdminPage } from "@/lib/authz";
import { listTickets } from "@/lib/support";
import { timeAgo } from "@/lib/format";
import { ChevronRightIcon } from "@/components/ui/icons";

export const metadata = { title: "Support · Admin · EcoQuest PH" };

export default async function AdminSupportPage({ searchParams }: PageProps<"/admin/support">) {
  await requireAdminPage();
  const closed = (await searchParams).status === "closed";
  const tickets = await listTickets(closed ? "CLOSED" : "OPEN");
  const now = new Date();
  const tab = (isClosedTab: boolean, label: string) => {
    const active = isClosedTab === closed;
    return (
      <Link
        href={isClosedTab ? "/admin/support?status=closed" : "/admin/support"}
        aria-current={active ? "page" : undefined}
        className={`min-h-10 rounded-lg px-4 py-2 text-sm font-semibold ${active ? "bg-card-3 text-emerald-300 ring-1 ring-line-strong" : "text-ink-2 hover:text-ink"}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Problem Reports</h2>
          <p className="text-sm text-ink-3">Reports from planters. Reply to chat with them; they&apos;re notified of each reply.</p>
        </div>
        <nav className="flex gap-1 rounded-xl bg-card p-1 ring-1 ring-line" aria-label="Report status">
          {tab(false, "Open")}
          {tab(true, "Resolved")}
        </nav>
      </header>
      {tickets.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-ink-3">
          {closed ? "No resolved reports yet." : "No open reports."}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line/80 bg-card">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/support/${t.id}`} className="flex min-h-16 items-center gap-3 px-5 py-3 hover:bg-card-2">
                {t.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400" aria-label="Unread" />}
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${t.unread ? "font-bold text-ink" : "font-semibold text-ink-2"}`}>{t.subject}</span>
                  <span className="block truncate text-xs text-ink-3">
                    {t.userName}
                    {t.userEmail && ` · ${t.userEmail}`} · {t.messages} message{t.messages === 1 ? "" : "s"} · {timeAgo(new Date(t.lastMessageAt), now)}
                  </span>
                </span>
                <ChevronRightIcon className="h-5 w-5 text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
