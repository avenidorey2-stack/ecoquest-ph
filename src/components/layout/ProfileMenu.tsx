"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/actions/auth";
import { disablePush } from "@/lib/push-client";
import { levelForXp } from "@/lib/levels";
import { ChevronRightIcon, FlagIcon, LogoutIcon, SettingsIcon, UsersIcon } from "@/components/ui/icons";

/**
 * The profile photo in the header opens this menu (like Facebook's): a card that opens your
 * profile, then Settings, Referral Hub, Take the Tour and Log Out.
 */
export default function ProfileMenu({
  name,
  avatar,
  xp,
}: {
  name: string;
  /** The round profile photo (or initial) shown on the button and in the card. */
  avatar: (size: string) => React.ReactNode;
  xp: number;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const firstItem = useRef<HTMLAnchorElement>(null);
  const pathname = usePathname();
  const level = levelForXp(xp);

  // Close on navigation, a tap outside, or Escape.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    firstItem.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 text-left text-sm font-semibold text-ink transition-colors hover:bg-card-2 focus-visible:bg-card-2 focus-visible:outline-none";
  const iconWrap = "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card-3 text-ink-2";

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Your profile and settings"
        data-tour="profile-menu"
        className="eq-hit relative block rounded-full"
      >
        {avatar("h-10 w-10")}
        {/* Phones: the level rides on the profile photo, leaving room for the page title. */}
        <span
          data-tour="level"
          title="Your level"
          className="absolute -bottom-1 -left-1 grid h-5 min-w-5 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 px-1 text-[10px] font-extrabold text-amber-950 ring-2 ring-canvas sm:hidden"
        >
          <span className="sr-only">Level </span>
          {level}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Profile menu"
          className="eq-rise fixed inset-x-3 top-16 z-[1400] max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl border border-line-strong bg-card p-2 shadow-[0_20px_48px_-12px_rgba(0,0,0,.7)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-80"
        >
          <Link
            ref={firstItem}
            href="/profile"
            role="menuitem"
            className="flex items-center gap-3 rounded-xl border border-line bg-card-2/60 p-3 shadow-sm transition-colors hover:bg-card-2 focus-visible:bg-card-2 focus-visible:outline-none"
          >
            {avatar("h-12 w-12")}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-ink">{name}</span>
              <span className="block text-xs text-ink-3">Level {level} · See Your Profile</span>
            </span>
            <ChevronRightIcon className="h-5 w-5 text-ink-3" />
          </Link>

          <div className="mt-2 space-y-0.5">
            <Link href="/settings" role="menuitem" className={item}>
              <span className={iconWrap}>
                <SettingsIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                Settings
                <span className="block text-xs font-normal text-ink-3">Privacy, Password & Help</span>
              </span>
              <ChevronRightIcon className="h-5 w-5 text-ink-3" />
            </Link>
            <Link href="/referrals" role="menuitem" className={item}>
              <span className={iconWrap}>
                <UsersIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                Referral Hub
                <span className="block text-xs font-normal text-ink-3">Invite friends, earn bonus points</span>
              </span>
              <ChevronRightIcon className="h-5 w-5 text-ink-3" />
            </Link>
            <Link href="/dashboard?tour=1" role="menuitem" className={item}>
              <span className={iconWrap}>
                <FlagIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                Take the Tour
                <span className="block text-xs font-normal text-ink-3">See where everything is</span>
              </span>
            </Link>
          </div>

          <div className="mt-1 border-t border-line pt-1">
            {/* Signing out also stops this device's notifications (someone else may sign in next). */}
            <form action={signOutAction} onSubmit={() => void disablePush()}>
              <button type="submit" role="menuitem" className={`${item} text-rose-200 hover:bg-rose-500/10`}>
                <span className={`${iconWrap} bg-rose-500/15 text-rose-300`}>
                  <LogoutIcon className="h-5 w-5" />
                </span>
                Log Out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
