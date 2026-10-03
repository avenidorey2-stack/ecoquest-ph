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
  GiftIcon,
  LogoMark,
  LogoutIcon,
  MenuIcon,
  PinIcon,
  ShieldIcon,
  TrophyIcon,
  UsersIcon,
  MedalIcon,
  SproutIcon,
  TreeIcon,
  WalletIcon,
} from "@/components/ui/icons";
import NotificationBell from "./NotificationBell";
import EcoBackground from "./EcoBackground";

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
  { href: "/profile", label: "Profile", hint: "Location settings", Icon: PinIcon },
  { href: "/leaderboard", label: "Leaderboard", hint: "Local / National", Icon: TrophyIcon },
  { href: "/shop", label: "Shop", hint: "Order seedlings", Icon: SproutIcon },
  { href: "/rewards", label: "Rewards", hint: "GCash, Maya & vouchers", Icon: GiftIcon },
  { href: "/transactions", label: "Transactions", hint: "Orders & redemptions", Icon: WalletIcon },
  { href: "/referrals", label: "Referral Hub", hint: null, Icon: UsersIcon },
  { href: "/achievements", label: "Achievements", hint: "Badges & levels", Icon: MedalIcon },
  { href: "/trees", label: "Tree Directory", hint: "Native PH trees", Icon: TreeIcon },
];
const ADMIN = { href: "/admin", label: "Admin Portal", hint: null, Icon: ShieldIcon };

const PAGE_TITLES: [prefix: string, title: string, subtitle: string][] = [
  ["/profile", "Profile & Location", "Your account details and verified home city."],
  ["/leaderboard", "Leaderboard", "This week's top planters, locally and nationally."],
  ["/shop", "Seedling Shop", "Order native tree seedlings with your planting points."],
  ["/rewards", "Rewards", "Turn your planting points into GCash, Maya and vouchers."],
  ["/transactions", "Transactions", "Your seedling orders and reward redemptions, with live status."],
  ["/planters", "Planter Profile", "Achievements and approved plantings, each with the date acquired."],
  ["/referrals", "Referral Hub", "Invite friends and earn bonus points."],
  ["/admin", "Admin Portal", "Slots, verifications, rewards and patrons."],
  ["/achievements", "Achievements", "Badges you've earned and the ones still ahead."],
  ["/trees", "Tree Directory", "Native Philippine trees worth planting."],
];

function Avatar({ user, size = "h-10 w-10" }: { user: ShellUser; size?: string }) {
  const initial = (user.name ?? "?").trim().slice(0, 1).toUpperCase() || "?";
  return user.image ? (
    // eslint-disable-next-line @next/next/no-img-element -- external OAuth avatar
    <img src={user.image} alt="" className={`${size} rounded-full object-cover ring-2 ring-emerald-100`} />
  ) : (
    <span
      className={`${size} flex items-center justify-center rounded-full bg-emerald-700 font-semibold text-emerald-50 ring-2 ring-emerald-100`}
    >
      {initial}
    </span>
  );
}

function SidebarContent({
  user,
  status,
  pathname,
  onNavigate,
}: {
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

      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-1">
          {links.map(({ href, label, hint, Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200 ${
                    active
                      ? "bg-emerald-500/15 text-white ring-1 ring-emerald-400/25"
                      : "text-emerald-100/75 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {active && (
                    <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-emerald-300 eq-fade" aria-hidden />
                  )}
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5 ${active ? "text-emerald-300" : "text-emerald-200/60 group-hover:text-emerald-200"}`}
                  />
                  <span className="leading-tight">
                    <span className="block font-medium">{label}</span>
                    {hint && <span className="block text-[11px] text-emerald-200/50">{hint}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-3 p-4">
        <section aria-label="System status" className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/70">System status</p>
          <dl className="mt-2.5 space-y-2 text-xs">
            <div>
              <dt className="text-emerald-100/50">PSGC location</dt>
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

        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm text-emerald-100/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogoutIcon className="h-4 w-4" /> Log out
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
  children,
}: {
  user: ShellUser;
  status: ShellStatus;
  serverNowIso: string;
  unreadNotifications: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const firstName = (user.name ?? "Planter").trim().split(/\s+/)[0];
  const page = PAGE_TITLES.find(([prefix]) => pathname.startsWith(prefix));
  const title = page ? page[1] : `Welcome back, ${firstName}`;
  const subtitle = page ? page[2] : "Your environmental impact and active quests overview.";

  return (
    <div className="min-h-screen text-slate-900">
      <EcoBackground />
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-[1100] hidden w-64 bg-gradient-to-b from-emerald-950 to-[#04291f] lg:block">
        <SidebarAmbience />
        <SidebarContent user={user} status={status} pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {open && <div className="eq-fade fixed inset-0 z-[1200] bg-slate-950/50 backdrop-blur-[2px] lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside
        className={`fixed inset-y-0 left-0 z-[1300] w-72 bg-gradient-to-b from-emerald-950 to-[#04291f] shadow-2xl transition-[transform,visibility] duration-300 ease-out lg:hidden ${
          open ? "translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <SidebarAmbience />
        <button
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="absolute right-3 top-5 z-10 rounded-lg p-1.5 text-emerald-100/70 hover:bg-white/10"
        >
          <CloseIcon />
        </button>
        <SidebarContent user={user} status={status} pathname={pathname} onNavigate={() => setOpen(false)} />
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-[1000] border-b border-slate-200/70 bg-cream-50/85 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-200/60 lg:hidden"
            >
              <MenuIcon />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[13px] font-bold uppercase tracking-wide text-slate-900 sm:text-base sm:tracking-[0.12em]">
                {title}
              </h1>
              <p className="hidden truncate text-xs text-slate-500 sm:block">{subtitle}</p>
            </div>
            <Link href="/achievements" title="Your level" className="hidden rounded-xl px-2 py-1 hover:bg-white/70 sm:block">
              <LevelBar xp={user.xp} compact />
            </Link>
            <Link
              href="/achievements"
              title="Your level"
              className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-xs font-extrabold text-amber-950 ring-2 ring-amber-100 sm:hidden"
            >
              {levelForXp(user.xp)}
            </Link>
            <div className="hidden border-l border-slate-200 pl-3 xl:block">
              <LiveClock initialIso={serverNowIso} />
            </div>
            <Link
              href="/rewards"
              title="Points balance"
              className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              <CoinIcon className="h-4 w-4" />
              {user.points.toLocaleString("en-PH")}
              <span className="hidden text-xs font-medium text-emerald-600 sm:inline">pts</span>
            </Link>
            <NotificationBell initialUnread={unreadNotifications} />
            <Link href="/profile" title="Profile" className="shrink-0">
              <Avatar user={user} />
            </Link>
          </div>
        </header>

        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
