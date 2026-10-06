import { notFound } from "next/navigation";
import { requirePageUserId } from "@/lib/authz";
import { getThread } from "@/lib/messages";
import DirectChat from "@/components/chat/DirectChat";

export const metadata = { title: "Chat · EcoQuest PH" };

/** A chat with one planter (full screen on phones). Opening it marks it read. */
export default async function ChatPage({ params }: PageProps<"/messages/[userId]">) {
  const userId = await requirePageUserId();
  const thread = await getThread(userId, (await params).userId);
  if (!thread) notFound();
  return <DirectChat key={thread.partner.id} initial={thread} />;
}
