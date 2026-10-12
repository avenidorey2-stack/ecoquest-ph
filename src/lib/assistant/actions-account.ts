import { prisma } from "@/lib/prisma";
import { searchCities, resolveCity } from "@/lib/psgc";
import { MAX_NAME_LENGTH } from "@/lib/profile";
import { MESSAGE_MAX, SUBJECT_MAX } from "@/lib/support";
import { getReferralSummary, REFERRAL_BONUS_POINTS } from "@/lib/referrals";
import { getAppOrigin } from "@/lib/url";
import type { ActionOutcome, SettingChange } from "./actions";

// Action cards for the planter's own account: name, home city, profile picture, settings, an
// invite code, a problem report to the team, and marking notifications read. Each card calls the
// same route as the Profile/Settings pages. Password changes and deleting the account stay on the
// Settings page: passwords never go through the chat.

export const ACCOUNT_ACTIONS = [
  "change_name",
  "change_city",
  "set_photo",
  "remove_photo",
  "settings",
  "invite_code",
  "report_problem",
  "read_notifications",
] as const;
export type AccountAction = (typeof ACCOUNT_ACTIONS)[number];

export type AccountInput = {
  action: string;
  /** New name, city name, or invite code. */
  value?: string;
  cityCode?: string;
  subject?: string;
  text?: string;
  settings?: Record<string, unknown>;
};

const VISIBILITY: Record<string, string> = { EVERYONE: "Everyone", FRIENDS: "Friends Only", ONLY_ME: "Only Me" };
const SWITCHES: Record<string, string> = {
  allowComments: "Allow Comments on My Photos",
  showActiveStatus: "Show When You're Active",
  notifyFriendRequests: "Friend Request Notifications",
  notifyLikes: "Like Notifications",
  notifyComments: "Comment & Reply Notifications",
  allowMessageRequests: "Message Requests from Non-Friends",
};
export const SETTING_FIELDS = ["photoVisibility", ...Object.keys(SWITCHES)];

const profile = [{ label: "Open Profile", href: "/profile" }];
const settings = [{ label: "Open Settings", href: "/settings" }];

export async function accountAction(userId: string, input: AccountInput): Promise<ActionOutcome> {
  const action = input.action as AccountAction;
  if (!ACCOUNT_ACTIONS.includes(action)) return { error: `Unknown action. Use one of: ${ACCOUNT_ACTIONS.join(", ")}.` };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      cityCode: true,
      avatarUrl: true,
      image: true,
      photoVisibility: true,
      allowComments: true,
      showActiveStatus: true,
      allowMessageRequests: true,
      notifyFriendRequests: true,
      notifyLikes: true,
      notifyComments: true,
    },
  });
  if (!user) return { error: "I couldn't find your account." };

  switch (action) {
    case "change_name": {
      const name = (input.value ?? "").trim();
      if (!name) return { error: "What should the new name be?" };
      if (name.length > MAX_NAME_LENGTH) return { error: `Names can be up to ${MAX_NAME_LENGTH} characters.` };
      if (name === user.name) return { error: `Your name is already ${name}.`, links: profile };
      return { action: { kind: "change_name", current: user.name ?? "", name } };
    }
    case "change_city": {
      const current = resolveCity(user.cityCode);
      const place = input.cityCode ? resolveCity(input.cityCode) : null;
      let hit = place ? { code: place.cityCode, name: place.city, province: place.province } : null;
      if (!hit) {
        const q = (input.value ?? "").trim();
        if (!q) return { error: "Which city or municipality?" };
        const hits = searchCities(q, 6);
        if (!hits.length) return { error: `I couldn't find a city or municipality called "${q}".`, links: profile };
        // "Cebu" finds both City of Cebu and towns in Cebu: ask unless one is the clear match.
        const exact = hits.filter((h) => h.name.toLowerCase().replace(/^city of /, "") === q.toLowerCase().replace(/^city of | city$/g, ""));
        if (hits.length > 1 && exact.length !== 1) {
          return { error: "More than one place matches. Ask which one, then use its city_code.", choices: hits.map((h) => ({ city_code: h.code, name: h.name, province: h.province })) };
        }
        hit = exact[0] ?? hits[0];
      }
      if (hit.code === user.cityCode) return { error: `Your home city is already ${hit.name}.`, links: profile };
      return {
        action: { kind: "change_city", cityCode: hit.code, city: hit.name, province: hit.province, current: current ? `${current.city}, ${current.province}` : null },
      };
    }
    case "set_photo":
      return { action: { kind: "profile_photo", remove: false, current: user.avatarUrl ?? user.image } };
    case "remove_photo":
      if (!user.avatarUrl) return { error: "You haven't uploaded a profile picture.", links: profile };
      return { action: { kind: "profile_photo", remove: true, current: user.avatarUrl } };
    case "settings": {
      const changes: SettingChange[] = [];
      for (const [field, value] of Object.entries(input.settings ?? {})) {
        if (field === "photoVisibility") {
          if (typeof value !== "string" || !(value in VISIBILITY)) return { error: "Photo privacy must be EVERYONE, FRIENDS or ONLY_ME." };
          if (value !== user.photoVisibility) changes.push({ field, value, label: `Who can see your planting photos: ${VISIBILITY[value]}` });
        } else if (field in SWITCHES) {
          if (typeof value !== "boolean") return { error: `${field} must be true or false.` };
          if (value !== user[field as keyof typeof user]) changes.push({ field, value, label: `${SWITCHES[field]}: ${value ? "On" : "Off"}` });
        } else {
          return { error: `I can't change "${field}" from the chat. Settings I can change: ${SETTING_FIELDS.join(", ")}.`, links: settings };
        }
      }
      if (!changes.length) return { error: "Those settings are already set that way.", links: settings };
      return { action: { kind: "update_settings", changes } };
    }
    case "invite_code": {
      const code = (input.value ?? "").trim();
      if (!code) return { error: "What's the invite code?" };
      const referrer = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true, name: true } });
      if (!referrer) return { error: "That invite code doesn't exist. Check it with the friend who invited you.", links: [{ label: "Open Referrals", href: "/referrals" }] };
      if (referrer.id === userId) return { error: "That's your own invite code." };
      return { action: { kind: "invite_code", code, referrerName: referrer.name ?? "a planter" } };
    }
    case "report_problem": {
      const message = (input.text ?? "").trim().slice(0, MESSAGE_MAX);
      if (!message) return { error: "What's the problem? Ask the planter to describe it." };
      const subject = ((input.subject ?? "").trim() || message.split(/[.!?\n]/)[0]).slice(0, SUBJECT_MAX);
      return { action: { kind: "report_problem", subject, message } };
    }
    case "read_notifications": {
      const unread = await prisma.notification.count({ where: { userId, isRead: false } });
      if (!unread) return { error: "You have no unread notifications." };
      return { action: { kind: "read_notifications", unread } };
    }
  }
}

/** The planter's own settings and invite link, for the AI to answer questions about them. */
export async function myAccount(userId: string) {
  const [user, referrals, unread, origin] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        cityCode: true,
        referralCode: true,
        avatarUrl: true,
        photoVisibility: true,
        allowComments: true,
        showActiveStatus: true,
        allowMessageRequests: true,
        notifyFriendRequests: true,
        notifyLikes: true,
        notifyComments: true,
      },
    }),
    getReferralSummary(userId),
    prisma.notification.count({ where: { userId, isRead: false } }),
    // Outside a request (scripts, tests) there are no headers: fall back to a relative link.
    getAppOrigin().catch(() => ""),
  ]);
  if (!user) return null;
  const place = resolveCity(user.cityCode);
  const { avatarUrl, cityCode: _cityCode, referralCode, ...rest } = user; // eslint-disable-line @typescript-eslint/no-unused-vars
  return {
    ...rest,
    homeCity: place ? `${place.city}, ${place.province}` : null,
    hasProfilePicture: !!avatarUrl,
    unreadNotifications: unread,
    invite: {
      code: referralCode,
      link: `${origin}/r/${referralCode}`,
      bonusPerFriend: REFERRAL_BONUS_POINTS,
      invited: referrals.invited,
      qualified: referrals.qualified,
      pointsEarned: referrals.pointsEarned,
    },
  };
}
