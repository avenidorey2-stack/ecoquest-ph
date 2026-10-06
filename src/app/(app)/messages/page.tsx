import { requirePageUserId } from "@/lib/authz";
import { chatFriends, listConversations } from "@/lib/messages";
import Inbox from "@/components/chat/Inbox";

export const metadata = { title: "Messages · EcoQuest PH" };

/** Chats with friends, and friends to start one with. */
export default async function MessagesPage() {
  const userId = await requirePageUserId();
  const [conversations, friends] = await Promise.all([listConversations(userId), chatFriends(userId)]);
  return <Inbox initial={conversations} friends={friends} />;
}
