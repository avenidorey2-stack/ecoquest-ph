import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/authz";
import { getTicket } from "@/lib/support";
import SupportThread from "@/components/support/SupportThread";

export const metadata = { title: "Report · Admin · EcoQuest PH" };

export default async function AdminTicketPage({ params }: PageProps<"/admin/support/[id]">) {
  const admin = await requireAdminPage();
  const ticket = await getTicket((await params).id, admin);
  if (!ticket) notFound();

  // Full-screen chat (see ChatFrame); it keeps itself up to date.
  return <SupportThread ticket={ticket} team />;
}
