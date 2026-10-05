import Link from "next/link";
import { requirePageUserId } from "@/lib/authz";
import { listMyTickets } from "@/lib/support";
import { timeAgo } from "@/lib/format";
import { Card } from "@/components/settings/SettingsPanels";
import NewReportForm from "@/components/support/NewReportForm";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";

export const metadata = { title: "Report a Problem · EcoQuest PH" };

export default async function SupportPage() {
  const userId = await requirePageUserId();
  const tickets = await listMyTickets(userId);
  const now = new Date();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 text-ink sm:px-6 lg:py-8">
      <Link href="/settings" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-emerald-300 hover:text-emerald-200">
        <ChevronLeftIcon className="h-4 w-4" /> Back to Settings
      </Link>
      <Card heading="Report a Problem">
        <p className="mb-4 text-sm text-ink-3">Something not working? Tell our team. We&apos;ll reply here, and you&apos;ll get a notification.</p>
        <NewReportForm />
      </Card>
      {tickets.length > 0 && (
        <Card heading="Your Reports">
          <ul className="-my-2 divide-y divide-line">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/settings/support/${t.id}`} className="flex min-h-14 items-center gap-3 py-2 hover:text-emerald-200">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{t.subject}</span>
                    <span className="block text-xs text-ink-3">
                      {t.status === "CLOSED" ? "Resolved" : "Open"} · {timeAgo(new Date(t.lastMessageAt), now)}
                    </span>
                  </span>
                  {t.userUnread && <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-xs font-bold text-emerald-950">New Reply</span>}
                  <ChevronRightIcon className="h-5 w-5 text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
