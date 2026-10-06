import { requirePageUserId } from "@/lib/authz";
import { listFriends } from "@/lib/friends";
import { listConversations } from "@/lib/messages";
import Inbox from "@/components/chat/Inbox";

export const metadata = { title: "Messages · EcoQuest PH" };

/** Chats with friends, and friends to start one with. */
export default async function MessagesPage() {
  const userId = await requirePageUserId();
  const [conversations, { friends }] = await Promise.all([listConversations(userId), listFriends(userId)]);
  // Most recently active friends first, so "Active Now" ones lead.
  const ordered = [...friends].sort((a, b) => (b.activeAt ?? "").localeCompare(a.activeAt ?? ""));
  return <Inbox initial={conversations} friends={ordered} />;
}
