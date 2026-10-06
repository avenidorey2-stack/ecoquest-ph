import { redirect } from "next/navigation";
import { getCurrentUser, redirectToLogin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { resolveCity } from "@/lib/psgc";
import { displayAvatar } from "@/lib/avatar-url";
import AppShell from "@/components/layout/AppShell";
import { remindExpiringClaims } from "@/lib/quests";
import { unreadSummary } from "@/lib/messages";

/** Seeds the header clock so the first paint already shows the right time. */
function serverNowIso() {
  return new Date().toISOString();
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await getCurrentUser();
  if (!me) return redirectToLogin();

  // Any due "less than a day left" claim reminder lands before the bell's unread count is read.
  await remindExpiringClaims(me.id);
  // Read from the DB (not the session) so role, points and location are always current.
  const [user, unreadNotifications, messages] = await Promise.all([
    prisma.user.findUnique({
      where: { id: me.id },
      select: { name: true, image: true, avatarUrl: true, role: true, points: true, xp: true, emailVerified: true, cityCode: true, notifyToken: true },
    }),
    prisma.notification.count({ where: { userId: me.id, isRead: false } }),
    unreadSummary(me.id),
  ]);
  if (!user) redirect("/login");

  const place = resolveCity(user.cityCode);

  return (
    <AppShell
      user={{
        name: user.name,
        image: displayAvatar(user),
        points: user.points,
        xp: user.xp,
        isAdmin: user.role === "ADMIN",
      }}
      status={{
        location: place ? { city: place.city, province: place.province } : null,
        emailVerified: !!user.emailVerified,
      }}
      serverNowIso={serverNowIso()}
      unreadNotifications={unreadNotifications}
      unreadMessages={messages.unread}
      notifyChannel={`notify:${user.notifyToken}`}
    >
      {user.emailVerified ? (
        children
      ) : (
        // Only legacy accounts can get here: new email sign-ups are verified before the
        // account exists, and Google sign-ins require a Google-verified email.
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <p className="text-4xl" aria-hidden>
              ✉️
            </p>
            <h2 className="mt-3 text-lg font-semibold">Please Verify Your Email</h2>
            <p className="mt-2 text-sm text-ink-2">
              To keep EcoQuest PH free of spam, every account needs a verified email. Log out from the menu, then sign
              in with Google or create an account with your email to confirm it.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
