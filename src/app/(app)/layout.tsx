import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveCity } from "@/lib/psgc";
import { displayAvatar } from "@/lib/avatar-url";
import AppShell from "@/components/layout/AppShell";

/** Seeds the header clock so the first paint already shows the right time. */
function serverNowIso() {
  return new Date().toISOString();
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Read from the DB (not the session) so role, points and location are always current.
  const [user, unreadNotifications] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, image: true, avatarUrl: true, role: true, points: true, xp: true, emailVerified: true, cityCode: true, notifyToken: true },
    }),
    prisma.notification.count({ where: { userId: session.user.id, isRead: false } }),
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
            <h2 className="mt-3 text-lg font-semibold">Please verify your email</h2>
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
