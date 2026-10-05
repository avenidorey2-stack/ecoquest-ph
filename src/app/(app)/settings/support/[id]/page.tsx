import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUserId } from "@/lib/authz";
import { getTicket } from "@/lib/support";
import SupportThread from "@/components/support/SupportThread";
import AutoRefresh from "@/components/layout/AutoRefresh";
import { ChevronLeftIcon } from "@/components/ui/icons";

export const metadata = { title: "Report · EcoQuest PH" };

/** A planter's own report. Admins answer from the Admin Portal, so this view is the reporter's only. */
export default async function SupportTicketPage({ params }: PageProps<"/settings/support/[id]">) {
  const userId = await requirePageUserId();
  const ticket = await getTicket((await params).id, { id: userId, role: "USER" });
  if (!ticket) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6 text-ink sm:px-6 lg:py-8">
      <AutoRefresh seconds={10} />
      <Link href="/settings/support" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-emerald-300 hover:text-emerald-200">
        <ChevronLeftIcon className="h-4 w-4" /> All Reports
      </Link>
      <SupportThread ticket={ticket} />
    </div>
  );
}
