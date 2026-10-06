"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOutAction } from "@/app/actions/auth";
import LiveClock from "./LiveClock";
import LevelBar from "@/components/gamification/LevelBar";
import { levelForXp } from "@/lib/levels";
import {
  CloseIcon,
  CoinIcon,
  DashboardIcon,
  FlagIcon,
  GiftIcon,
  LogoMark,
  LogoutIcon,
  MenuIcon,
  MessagesIcon,
  PinIcon,
  SettingsIcon,
  ShieldIcon,
  TrophyIcon,
  UsersIcon,
  MedalIcon,
  SproutIcon,
  TreeIcon,
  UserCheckIcon,
  WalletIcon,
} from "@/components/ui/icons";
import NotificationBell from "./NotificationBell";
import MessagesButton from "./MessagesButton";
import { LiveChannel } from "./live";
import EcoBackground from "./EcoBackground";
import ScrollReveal, { TOUR_MENU_EVENT } from "./ScrollReveal";
import ActivePill from "@/components/ui/ActivePill";
import UserSearch from "@/components/social/UserSearch";

export type ShellUser = {
  name: string | null;
  image: string | null;
  points: number;
  xp: number;
  isAdmin: boolean;
};

export type ShellStatus = {
  /** Verified PSGC home location, e.g. { city: "City of Cebu", province: "Cebu" }. */
  location: { city: string; province: string } | null;
  emailVerified: boolean;
};

const NAV = [
  { href: "/dashboard", label: "Dashboard", hint: null, Icon: DashboardIcon },
  { href: "/profile", label: "Profile", hint: "Location Settings", Icon: PinIcon },
  { href: "/leaderboard", label: "Leaderboard", hint: "Local / National", Icon: TrophyIcon },
  { href: "/friends", label: "Friends", hint: "Requests & Friends", Icon: UserCheckIcon },
  { href: "/messages", label: "Messages", hint: "Chat With Friends", Icon: MessagesIcon },
  { href: "/shop", label: "Shop", hint: "Order Seedlings", Icon: SproutIcon },
  { href: "/rewards", label: "Rewards", hint: "GCash, Maya & Vouchers", Icon: GiftIcon },
  { href: "/transactions", label: "Transactions", hint: "Orders & Redemptions", Icon: WalletIcon },
  { href: "/referrals", label: "Referral Hub", hint: null, Icon: UsersIcon },
  { href: "/achievements", label: "Achievements", hint: "Badges & Levels", Icon: MedalIcon },
  { href: "/trees", label: "Tree Directory", hint: "Native PH Trees", Icon: TreeIcon },
  { href: "/settings", label: "Settings", hint: "Privacy, Password & Help", Icon: SettingsIcon },
];
const ADMIN = { href: "/admin", label: "Admin Portal", hint: null, Icon: ShieldIcon };

const PAGE_TITLES: [prefix: string, title: string, subtitle: string][] = [
  ["/profile", "Profile & Location", "Your account details and verified home city."],
  ["/leaderboard", "Leaderboard", "This week's top planters, locally and nationally."],
  ["/friends", "Friends", "Friend requests and your planting friends."],
  ["/messages", "Messages", "Chat with your planting friends."],
  ["/shop", "Seedling Shop", "Order native tree seedlings with your planting points."],
  ["/rewards", "Rewards", "Turn your planting points into GCash, Maya and vouchers."],
  ["/transactions", "Transactions", "Your seedling orders and reward redemptions, with live status."],
  ["/planters", "Planter Profile", "Achievements and approved plantings, each with the date acquired."],
  ["/referrals", "Referral Hub", "Invite friends and earn bonus points."],
  ["/admin", "Admin Portal", "Slots, verifications, rewards and patrons."],
  ["/achievements", "Achievements", "Badges you've earned and the ones still ahead."],
  ["/trees", "Tree Directory", "Native Philippine trees worth planting."],
  ["/settings", "Settings", "Privacy, notifications, password and help."],
];

function Avatar({ user, size = "h-10 w-10" }: { user: ShellUser; size?: string }) {
  const initial = (user.name ?? "?").trim().slice(0, 1).toUpperCase() || "?";
  return user.image ? (
    // eslint-disable-next-line @next/next/no-img-element -- external OAuth avatar
    <img src={user.image} alt="" className={`${size} rounded-full object-cover ring-2 ring-emerald-400/20`} />
  ) : (
    <span
      className={`${size} flex items-center justify-center rounded-full bg-emerald-400 font-semibold text-emerald-950 ring-2 ring-emerald-400/20`}
    >
      {initial}
    </span>
  );
}

function SidebarContent({
  navId,
  user,
  status,
  pathname,
  onNavigate,
}: {
  /** Unique per rendered sidebar so the desktop and drawer highlights animate independently. */
  navId: string;
  user: ShellUser;
  status: ShellStatus;
  pathname: string;
  onNavigate?: () => void;
}) {
  const links = user.isAdmin ? [...NAV, ADMIN] : NAV;
  const geofenceActive = !!status.location && status.emailVerified;

  return (
    <div className="relative flex h-full flex-col">
      <Link href="/dashboard" onClick={onNavigate} className="group/logo flex items-center gap-3 px-5 py-5">
        <span className="transition-transform duration-500 ease-out group-hover/logo:rotate-[-8deg]">
          <LogoMark />
        </span>
        <span className="leading-tight">
          <span className="block text-[15px] font-bold tracking-tight text-white">EcoQuest PH</span>
          <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-300/80">Portal</span>
        </span>
      </Link>

      <nav aria-label="Main navigation" data-tour="nav" className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-1">
          {links.map(({ href, label, hint, Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  data-tour={`nav-${href.slice(1)}`}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors duration-200 ${
                    active ? "text-white" : "text-emerald-100/75 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {active && (
                    <>
                      <ActivePill id={`${navId}-bg`} className="inset-0 rounded-xl bg-gradient-to-r from-emerald-400/20 to-emerald-400/[0.04] ring-1 ring-emerald-400/25" />
                      <ActivePill id={`${navId}-bar`} className="inset-y-2 left-0 w-[3px] rounded-r-full bg-emerald-300 shadow-[0_0_10px_2px_rgba(110,231,183,.6)]" />
                    </>
                  )}
                  <Icon
                    className={`relative h-[18px] w-[18px] shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5 ${active ? "text-emerald-300" : "text-emerald-200/60 group-hover:text-emerald-200"}`}
                  />
                  <span className="relative leading-tight">
                    <span className="block font-medium">{label}</span>
                    {hint && <span className="block text-[11px] text-emerald-200/50">{hint}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-2.5 p-4">
        <section aria-label="System Status" className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/70">System Status</p>
          <dl className="mt-2.5 space-y-2 text-xs">
            <div>
              <dt className="text-emerald-100/50">PSGC Location</dt>
              <dd className="mt-0.5 font-medium text-white">
                {status.location ? (
                  <>
                    {status.location.city}
                    <span className="block font-normal text-emerald-100/60">{status.location.province}</span>
                  </>
                ) : (
                  <Link href="/profile" onClick={onNavigate} className="text-amber-300 underline-offset-2 hover:underline">
                    Not set — choose city
                  </Link>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-emerald-100/50">Geofence</dt>
              <dd className="flex items-center gap-1.5 font-medium">
                <span
                  className={`h-2 w-2 rounded-full ${geofenceActive ? "bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,.2)]" : "bg-amber-400"}`}
                />
                <span className={geofenceActive ? "text-emerald-300" : "text-amber-300"}>
                  {geofenceActive ? "Active" : "Inactive"}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        <Link
          href="/dashboard?tour=1"
          onClick={onNavigate}
          data-tour="tour-replay"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2.5 text-sm font-semibold text-emerald-200 transition-colors hover:border-emerald-300/60 hover:bg-emerald-400/20 hover:text-white"
        >
          <FlagIcon className="h-4 w-4" /> Take the Tour
        </Link>
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-400/35 bg-rose-500/10 px-3 py-2.5 text-sm font-semibold text-rose-200 transition-colors hover:border-rose-300/60 hover:bg-rose-500/20 hover:text-white"
          >
            <LogoutIcon className="h-4 w-4" /> Log Out
          </button>
        </form>
      </div>
    </div>
  );
}

/** Slow light sweep + faint leaf watermark behind the sidebar links. */
function SidebarAmbience() {
  return (
    <div className="eq-sidebar-glow" aria-hidden>
      <svg viewBox="0 0 24 24" className="absolute -bottom-10 -right-14 h-64 w-64 rotate-12 text-emerald-300/[0.06]">
        <path fill="currentColor" d="M4 20C4 10.5 10.5 4 20 4c0 9.5-6.5 16-16 16Z" />
      </svg>
    </div>
  );
}

export default function AppShell({
  user,
  status,
  serverNowIso,
  unreadNotifications,
  unreadMessages,
  notifyChannel,
  children,
}: {
  user: ShellUser;
  status: ShellStatus;
  serverNowIso: string;
  unreadNotifications: number;
  /** Chats with unread messages. */
  unreadMessages: number;
  /** The user's secret live-notification channel ("notify:<token>"). */
  notifyChannel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // The guided tour opens the drawer on phones to point at the menu items inside it.
  useEffect(() => {
    const onTourMenu = (e: Event) => setOpen((e as CustomEvent<boolean>).detail);
    window.addEventListener(TOUR_MENU_EVENT, onTourMenu);
    return () => window.removeEventListener(TOUR_MENU_EVENT, onTourMenu);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const firstName = (user.name ?? "Planter").trim().split(/\s+/)[0];
  const page = PAGE_TITLES.find(([prefix]) => pathname.startsWith(prefix));
  const title = page ? page[1] : `Welcome Back, ${firstName}`;
  const subtitle = page ? page[2] : "Your environmental impact and active quests overview.";

  return (
    <LiveChannel value={notifyChannel}>
    <div className="min-h-dvh text-ink">
      <EcoBackground />
      <ScrollReveal />
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-[1100] hidden w-64 border-r border-line bg-gradient-to-b from-card to-canvas lg:block">
        <SidebarAmbience />
        <SidebarContent navId="nav-desktop" user={user} status={status} pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {open && <div className="eq-fade fixed inset-0 z-[1200] bg-black/65 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside
        data-tour-drawer
        className={`fixed inset-y-0 left-0 z-[1300] w-72 border-r border-line bg-gradient-to-b from-card to-canvas shadow-2xl transition-[transform,visibility] duration-300 ease-out lg:hidden ${
          open ? "translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <SidebarAmbience />
        <button
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="absolute right-3 top-3.5 z-10 grid h-11 w-11 place-items-center rounded-xl text-emerald-100/70 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-emerald-400"
        >
          <CloseIcon />
        </button>
        <SidebarContent navId="nav-drawer" user={user} status={status} pathname={pathname} onNavigate={() => setOpen(false)} />
      </aside>

      <div className="flex min-h-dvh flex-col lg:pl-64">
        <header className="sticky top-0 z-[1000] border-b border-line/70 bg-canvas lg:bg-canvas/75 lg:backdrop-blur-md">
          <div className="flex h-16 items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
            <button
              onClick={() => setOpen(true)}
              data-tour="menu"
              aria-label="Open menu"
              aria-expanded={open}
              className="-ml-2 grid h-11 w-11 place-items-center rounded-xl text-ink-2 hover:bg-card-3/60 lg:hidden"
            >
              <MenuIcon />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="line-clamp-2 text-[12px] font-bold uppercase leading-tight tracking-wide text-ink sm:truncate sm:text-base sm:tracking-[0.12em]">
                {title}
              </h1>
              <p className="hidden truncate text-xs text-ink-3 sm:block">{subtitle}</p>
            </div>
            <Link href="/achievements" title="Your level" data-tour="level" className="hidden rounded-xl px-2 py-1 hover:bg-white/5 sm:block">
              <LevelBar xp={user.xp} compact />
            </Link>
            <div className="hidden border-l border-line pl-3 xl:block">
              <LiveClock initialIso={serverNowIso} />
            </div>
            <Link
              href="/rewards"
              title="Points balance"
              data-tour="points"
              className="eq-hit relative flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-400/15"
            >
              <CoinIcon className="h-4 w-4" />
              {user.points.toLocaleString("en-PH")}
              <span className="hidden text-xs font-medium text-emerald-400 sm:inline">pts</span>
            </Link>
            {/* Messages and notifications sit side by side, like Facebook's header. */}
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <MessagesButton initialUnread={unreadMessages} since={serverNowIso} />
              <NotificationBell initialUnread={unreadNotifications} since={serverNowIso} />
            </div>
            <Link href="/profile" title="Profile" className="eq-hit relative shrink-0 rounded-full">
              <Avatar user={user} />
              {/* Phones: the level rides on the profile photo, leaving room for the page title. */}
              <span
                data-tour="level"
                title="Your level"
                className="absolute -bottom-1 -left-1 grid h-5 min-w-5 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 px-1 text-[10px] font-extrabold text-amber-950 ring-2 ring-canvas sm:hidden"
              >
                <span className="sr-only">Level </span>
                {levelForXp(user.xp)}
              </span>
            </Link>
          </div>
        </header>
        <UserSearch />

        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
    </LiveChannel>
  );
}
