import { requirePageUserId } from "@/lib/authz";
import { listFriends, type PlanterCard } from "@/lib/friends";
import FriendRow from "@/components/social/FriendRow";
import { SearchIcon, UserCheckIcon, UserPlusIcon } from "@/components/ui/icons";

export const metadata = { title: "Friends · EcoQuest PH" };

function Section({ title, icon, cards, empty }: { title: string; icon: React.ReactNode; cards: PlanterCard[]; empty: string }) {
  return (
    <section className="eq-panel overflow-hidden rounded-2xl border border-line/80 bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3">
          {icon} {title}
        </h2>
        <span className="text-xs font-semibold text-ink-3">{cards.length}</span>
      </header>
      {cards.length ? (
        <ul className="divide-y divide-line">
          {cards.map((c) => (
            <FriendRow key={`${c.id}-${c.state}`} card={c} />
          ))}
        </ul>
      ) : (
        <p className="px-5 py-5 text-sm text-ink-3">{empty}</p>
      )}
    </section>
  );
}

/** Friend requests (received and sent) and friends. Find planters with the search bar above. */
export default async function FriendsPage() {
  const userId = await requirePageUserId();
  const { friends, incoming, outgoing } = await listFriends(userId);
  const icon = "h-4 w-4 text-emerald-400";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 text-ink sm:px-6 lg:py-8">
      <p className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
        <SearchIcon className="h-4 w-4 shrink-0 text-emerald-300" />
        Find planters with the search bar at the top, then tap Add Friend.
      </p>
      {incoming.length > 0 && (
        <Section title="Friend Requests" icon={<UserPlusIcon className={icon} />} cards={incoming} empty="" />
      )}
      <Section
        title="Friends"
        icon={<UserCheckIcon className={icon} />}
        cards={friends}
        empty="No friends yet. Search for planters you know and add them."
      />
      {outgoing.length > 0 && <Section title="Sent Requests" icon={<UserPlusIcon className={icon} />} cards={outgoing} empty="" />}
    </div>
  );
}
