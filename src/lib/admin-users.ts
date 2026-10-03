import { prisma } from "@/lib/prisma";
import { displayAvatar } from "@/lib/avatar-url";

export type DirectoryUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  totalPlants: number;
  verified: boolean;
  joinedAt: string;
};

export type LocationGroup = {
  /** PSGC city code; null for users who haven't set a location yet. */
  cityCode: string | null;
  city: string | null;
  province: string | null;
  region: string | null;
  users: DirectoryUser[];
};

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  avatarUrl: string | null;
  city: string | null;
  province: string | null;
  region: string | null;
  cityCode: string | null;
  totalPlants: number;
  emailVerified: Date | null;
  createdAt: Date;
};

const byName = (a: DirectoryUser, b: DirectoryUser) =>
  (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "", "en", { sensitivity: "base" });

/**
 * Groups users by city (PSGC code — names like "San Jose" repeat across provinces).
 * Biggest cities first, ties by name; users without a location come last.
 */
export function groupUsersByLocation(rows: UserRow[]): LocationGroup[] {
  const groups = new Map<string | null, LocationGroup>();
  for (const row of rows) {
    const key = row.cityCode ?? null;
    let group = groups.get(key);
    if (!group) {
      group = key
        ? { cityCode: key, city: row.city, province: row.province, region: row.region, users: [] }
        : { cityCode: null, city: null, province: null, region: null, users: [] };
      groups.set(key, group);
    }
    group.users.push({
      id: row.id,
      name: row.name,
      email: row.email,
      image: displayAvatar(row),
      totalPlants: row.totalPlants,
      verified: row.emailVerified !== null,
      joinedAt: row.createdAt.toISOString(),
    });
  }
  for (const group of groups.values()) group.users.sort(byName);
  return [...groups.values()].sort((a, b) => {
    if (!a.cityCode !== !b.cityCode) return a.cityCode ? -1 : 1;
    return b.users.length - a.users.length || (a.city ?? "").localeCompare(b.city ?? "", "en");
  });
}

/** Every planter account (admins excluded, matching the Overview count), grouped by city. */
export async function getUsersByLocation() {
  const rows = await prisma.user.findMany({
    where: { role: "USER" },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      avatarUrl: true,
      city: true,
      province: true,
      region: true,
      cityCode: true,
      totalPlants: true,
      emailVerified: true,
      createdAt: true,
    },
  });
  return groupUsersByLocation(rows);
}
