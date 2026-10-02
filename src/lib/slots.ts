import type { SlotStatus } from "@/generated/prisma/client";
import { isInsidePhilippines } from "@/lib/geo";
import { resolveCity } from "@/lib/psgc";
import { MAX_QUEST_GOAL, MAX_SLOT_PARTICIPANTS } from "@/lib/slot-limits";

export { MAX_SLOT_PARTICIPANTS };

const STATUSES: SlotStatus[] = ["OPEN", "FULL", "CLOSED"];
const MAX_POINTS_PER_PLANT = 10_000;

type SlotPlace = { region: string; province: string; city: string; cityCode: string };
type SlotRules = {
  requiredPlantType: string;
  pointsPerPlant: number;
  status: SlotStatus;
  maxParticipants: number;
  questGoal: number;
};
type SlotUpdate = Partial<SlotPlace & SlotRules & { barangay: string | null }>;
type SlotCreate = SlotPlace &
  Omit<SlotRules, "status" | "maxParticipants" | "questGoal"> & {
    questGoal?: number;
    maxParticipants?: number;
    barangay?: string | null;
    latitude: number;
    longitude: number;
  };

const MAX_BARANGAY_LENGTH = 100;

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Validates a create payload: coordinates, PSGC cityCode, plant type and points are required. */
export function parseSlotCreate(body: Record<string, unknown>): Result<SlotCreate> {
  const { latitude, longitude } = body;
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return { ok: false, error: "latitude and longitude are required numbers." };
  }
  if (!isInsidePhilippines(latitude, longitude)) {
    return { ok: false, error: "Slot must be inside the Philippines." };
  }
  const rest = parseSlotUpdate(body);
  if (!rest.ok) return rest;
  const data = { ...rest.data };
  delete data.status; // new slots always start OPEN
  for (const field of ["cityCode", "requiredPlantType", "pointsPerPlant"] as const) {
    if (data[field] === undefined) return { ok: false, error: `${field} is required.` };
  }
  return { ok: true, data: { latitude, longitude, ...(data as Required<typeof data>) } };
}

/**
 * Validates an edit payload; only provided fields are returned. Coordinates are immutable.
 * A cityCode is expanded to canonical PSGC region/province/city names.
 */
export function parseSlotUpdate(body: Record<string, unknown>): Result<SlotUpdate> {
  const data: SlotUpdate = {};

  if (body.cityCode !== undefined) {
    const place = resolveCity(body.cityCode);
    if (!place) return { ok: false, error: "Unknown city/municipality code." };
    Object.assign(data, {
      cityCode: place.cityCode,
      region: place.region,
      province: place.province,
      city: place.city,
    });
  }

  if (body.requiredPlantType !== undefined) {
    const value = body.requiredPlantType;
    if (typeof value !== "string" || !value.trim()) {
      return { ok: false, error: "requiredPlantType cannot be empty." };
    }
    data.requiredPlantType = value.trim();
  }

  if (body.pointsPerPlant !== undefined) {
    const points = body.pointsPerPlant;
    if (!Number.isInteger(points) || (points as number) < 1 || (points as number) > MAX_POINTS_PER_PLANT) {
      return { ok: false, error: `pointsPerPlant must be an integer from 1 to ${MAX_POINTS_PER_PLANT}.` };
    }
    data.pointsPerPlant = points as number;
  }

  if (body.barangay !== undefined) {
    const value = body.barangay;
    if (value !== null && typeof value !== "string") return { ok: false, error: "barangay must be text." };
    const trimmed = value?.trim() ?? "";
    if (trimmed.length > MAX_BARANGAY_LENGTH) {
      return { ok: false, error: `barangay must be at most ${MAX_BARANGAY_LENGTH} characters.` };
    }
    data.barangay = trimmed || null;
  }

  if (body.questGoal !== undefined) {
    const goal = body.questGoal;
    if (!Number.isInteger(goal) || (goal as number) < 1 || (goal as number) > MAX_QUEST_GOAL) {
      return { ok: false, error: `questGoal (plants per quest) must be an integer from 1 to ${MAX_QUEST_GOAL}.` };
    }
    data.questGoal = goal as number;
  }

  if (body.maxParticipants !== undefined) {
    const max = body.maxParticipants;
    if (!Number.isInteger(max) || (max as number) < 1 || (max as number) > MAX_SLOT_PARTICIPANTS) {
      return { ok: false, error: `maxParticipants must be an integer from 1 to ${MAX_SLOT_PARTICIPANTS}.` };
    }
    data.maxParticipants = max as number;
  }

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as SlotStatus)) return { ok: false, error: "Invalid status." };
    data.status = body.status as SlotStatus;
  }

  return { ok: true, data };
}
