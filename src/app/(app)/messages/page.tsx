import { MessagesIcon } from "@/components/ui/icons";

export const metadata = { title: "Messages · EcoQuest PH" };

/** Desktop: the right side before a chat is picked (phones show only the chat list). */
export default function MessagesPage() {
  return (
    <div className="grid flex-1 place-items-center rounded-2xl border border-line/80 bg-card/60 p-6 text-center">
      <div>
        <MessagesIcon className="mx-auto h-10 w-10 text-emerald-300" />
        <p className="mt-3 text-base font-semibold text-ink">Pick a Chat</p>
        <p className="mt-1 text-sm text-ink-3">Choose a friend on the left to see your messages, or start a new chat.</p>
      </div>
    </div>
  );
}
