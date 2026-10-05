import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/authz";
import { getTicket } from "@/lib/support";
import SupportThread from "@/components/support/SupportThread";
import AutoRefresh from "@/components/layout/AutoRefresh";
import { ChevronLeftIcon } from "@/components/ui/icons";

export const metadata = { title: "Report · Admin · EcoQuest PH" };

export default async function AdminTicketPage({ params }: PageProps<"/admin/support/[id]">) {
  const admin = await requireAdminPage();
  const ticket = await getTicket((await params).id, admin);
  if (!ticket) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6 lg:p-8">
      <AutoRefresh seconds={10} />
      <Link href="/admin/support" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-emerald-300 hover:text-emerald-200">
        <ChevronLeftIcon className="h-4 w-4" /> All Reports
      </Link>
      <SupportThread ticket={ticket} team />
    </div>
  );
}
