import { notFound } from "next/navigation";
import { requirePageUserId } from "@/lib/authz";
import { getTicket } from "@/lib/support";
import SupportThread from "@/components/support/SupportThread";

export const metadata = { title: "Report · EcoQuest PH" };

/** A planter's own report. Admins answer from the Admin Portal, so this view is the reporter's only. */
export default async function SupportTicketPage({ params }: PageProps<"/settings/support/[id]">) {
  const userId = await requirePageUserId();
  const ticket = await getTicket((await params).id, { id: userId, role: "USER" });
  if (!ticket) notFound();

  // Full-screen chat (see ChatFrame); it keeps itself up to date.
  return <SupportThread ticket={ticket} />;
}
