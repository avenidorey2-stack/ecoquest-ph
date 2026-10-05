import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageUserId } from "@/lib/authz";
import { getSettings } from "@/lib/account-settings";
import { listBlocked } from "@/lib/blocks";
import { listMyTickets } from "@/lib/support";
import {
  BlockedPanel,
  Card,
  DeleteAccountPanel,
  NotificationsPanel,
  PasswordPanel,
  PrivacyPanel,
} from "@/components/settings/SettingsPanels";
import { ChatIcon, ChevronRightIcon } from "@/components/ui/icons";

export const metadata = { title: "Settings · EcoQuest PH" };

export default async function SettingsPage() {
  const userId = await requirePageUserId();
  const [settings, blocked, tickets] = await Promise.all([getSettings(userId), listBlocked(userId), listMyTickets(userId)]);
  if (!settings) redirect("/login");
  const unreadReplies = tickets.filter((t) => t.userUnread).length;
  const hasPassword = !!settings.passwordHash;
  const google = settings.accounts.some((a) => a.provider === "google");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 text-ink sm:px-6 lg:py-8">
      <Card heading="Account">
        <dl className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-ink-3">Email</dt>
            <dd className="font-medium text-ink">{settings.email ?? "—"}</dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-ink-3">Sign-In</dt>
            <dd className="font-medium text-ink">{[hasPassword && "Email & password", google && "Google"].filter(Boolean).join(" · ") || "—"}</dd>
          </div>
        </dl>
        <Link href="/profile" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-200 hover:bg-emerald-400/20">
          Edit Profile & Home City
        </Link>
      </Card>

      <PrivacyPanel initial={settings.photoVisibility} />
      <NotificationsPanel
        initial={{ notifyFriendRequests: settings.notifyFriendRequests, notifyLikes: settings.notifyLikes, notifyComments: settings.notifyComments }}
      />
      <PasswordPanel hasPassword={hasPassword} />
      <BlockedPanel initial={blocked} />

      <Card heading="Help">
        <Link href="/settings/support" className="flex min-h-14 items-center gap-3 rounded-xl border border-line-strong bg-card-2 px-4 py-3 hover:bg-card-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/25">
            <ChatIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">Report a Problem</span>
            <span className="block text-xs text-ink-3">Tell our team what went wrong and chat with them here.</span>
          </span>
          {unreadReplies > 0 && (
            <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-xs font-bold text-emerald-950">{unreadReplies} new</span>
          )}
          <ChevronRightIcon className="h-5 w-5 text-ink-3" />
        </Link>
        <Link href="/privacy" className="mt-2 flex min-h-11 items-center justify-between rounded-xl px-4 text-sm text-ink-2 hover:bg-card-2">
          Privacy Policy <ChevronRightIcon className="h-5 w-5 text-ink-3" />
        </Link>
      </Card>

      <DeleteAccountPanel hasPassword={hasPassword} canDelete={settings.role === "USER"} />
    </div>
  );
}
