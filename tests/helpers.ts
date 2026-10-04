import { vi } from "vitest";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, type Role } from "@/generated/prisma/client";

let counter = 0;
const uid = () => `${Date.now()}-${++counter}`;

export async function resetDb() {
  const tables = Object.values(Prisma.ModelName)
    .map((name) => `"${name}"`)
    .join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables} CASCADE`);
}

// Real PSGC codes (see src/data/psgc.json).
export const CODES = {
  quezonCity: "137404000",
  makati: "137602000",
  sanJoseBatangas: "041022000",
  sanJoseTarlac: "036918000",
};

export const QC_PLACE = {
  region: "National Capital Region",
  province: "Metro Manila",
  city: "Quezon City",
  cityCode: CODES.quezonCity,
};

export function createUser(overrides: Partial<Prisma.UserUncheckedCreateInput> & { role?: Role } = {}) {
  return prisma.user.create({
    data: { name: "Juan", email: `user-${uid()}@test.ph`, emailVerified: new Date(), ...QC_PLACE, ...overrides },
  });
}

export function createSlot(overrides: Partial<Prisma.SlotUncheckedCreateInput> = {}) {
  return prisma.slot.create({
    data: {
      latitude: 14.676,
      longitude: 121.0437,
      ...QC_PLACE,
      requiredPlantType: "Narra",
      pointsPerPlant: 10,
      ...overrides,
    },
  });
}

/** Sets the mocked Auth.js session. Pass null to sign out. */
/** Valid cash-on-delivery details for PESOS seedling orders. */
export const DELIVERY = {
  recipientName: "Juan Dela Cruz",
  contactNumber: "0917 123 4567",
  streetAddress: "12 Mabini St.",
  barangay: "San Roque",
  cityProvince: "Quezon City, Metro Manila",
  landmark: "Beside the barangay hall",
  instructions: "Call when you arrive",
};

export function signInAs(user: { id: string; role?: Role } | null) {
  vi.mocked(auth as unknown as () => Promise<unknown>).mockResolvedValue(
    user ? { user: { id: user.id, role: user.role ?? "USER" }, expires: "2099-01-01" } : null,
  );
}

/** Route-handler context with Next 16's promised params. */
export function ctx<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

export function jsonRequest(body: unknown, method = "POST") {
  return new Request("http://test.local", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function uploadRequest(file: File | null, plantCount: string | number) {
  const form = new FormData();
  if (file) form.set("file", file);
  form.set("plantCount", String(plantCount));
  return new Request("http://test.local", { method: "POST", body: form });
}

export const jpeg = (bytes = 1024) =>
  new File([new Uint8Array(bytes)], "proof.jpg", { type: "image/jpeg" });
