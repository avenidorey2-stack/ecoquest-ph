import { requirePageUserId } from "@/lib/authz";
import { chatFriends, listConversations } from "@/lib/messages";
import Inbox from "@/components/chat/Inbox";

/** Messages: the chat list stays put (beside the open chat on desktop) while chats change. */
export default async function MessagesLayout({ children }: LayoutProps<"/messages">) {
  const userId = await requirePageUserId();
  const [conversations, friends] = await Promise.all([listConversations(userId), chatFriends(userId)]);
  return (
    <Inbox initial={conversations} friends={friends}>
      {children}
    </Inbox>
  );
}
