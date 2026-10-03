import { beforeEach, describe, expect, it } from "vitest";
import { getUsersByLocation } from "@/lib/admin-users";
import { CODES, createUser, resetDb } from "../helpers";

beforeEach(resetDb);

const LAPU_LAPU = { region: "Region VII (Central Visayas)", province: "Cebu", city: "City of Lapu-Lapu", cityCode: "072226000" };
const SAN_JOSE_BATANGAS = { region: "CALABARZON (Region IV-A)", province: "Batangas", city: "San Jose", cityCode: CODES.sanJoseBatangas };
const SAN_JOSE_TARLAC = { region: "Region III (Central Luzon)", province: "Tarlac", city: "San Jose", cityCode: CODES.sanJoseTarlac };
const NO_PLACE = { region: null, province: null, city: null, cityCode: null };

describe("getUsersByLocation", () => {
  it("groups planters by city, biggest first, with no-location users last", async () => {
    await createUser({ name: "Maria" }); // Quezon City (helper default)
    await createUser({ name: "ana" });
    await createUser({ name: "Carlo" });
    await createUser({ name: "Lito", ...LAPU_LAPU });
    await createUser({ name: "Bea", ...LAPU_LAPU });
    await createUser({ name: null, email: "nolocation@test.ph", ...NO_PLACE });

    const groups = await getUsersByLocation();
    expect(groups.map((g) => [g.city, g.users.length])).toEqual([
      ["Quezon City", 3],
      ["City of Lapu-Lapu", 2],
      [null, 1],
    ]);
    expect(groups[0]).toMatchObject({ province: "Metro Manila", region: "National Capital Region", cityCode: CODES.quezonCity });
    // Names sort case-insensitively within a city.
    expect(groups[0].users.map((u) => u.name)).toEqual(["ana", "Carlo", "Maria"]);
    expect(groups[2]).toMatchObject({ cityCode: null, province: null });
    expect(groups[2].users[0]).toMatchObject({ name: null, email: "nolocation@test.ph" });
  });

  it("keeps same-named cities in different provinces apart", async () => {
    await createUser({ name: "A", ...SAN_JOSE_BATANGAS });
    await createUser({ name: "B", ...SAN_JOSE_TARLAC });

    const groups = await getUsersByLocation();
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.province).sort()).toEqual(["Batangas", "Tarlac"]);
  });

  it("leaves out admins and shows avatar, trees and verification", async () => {
    await createUser({ name: "Admin", role: "ADMIN" });
    await createUser({ name: "Uploaded", avatarUrl: "/api/avatars/abc.webp", image: "https://google/photo", totalPlants: 7 });
    await createUser({ name: "Pending", emailVerified: null });

    const [qc] = await getUsersByLocation();
    expect(qc.users.map((u) => u.name)).toEqual(["Pending", "Uploaded"]);
    expect(qc.users[0]).toMatchObject({ verified: false, image: null, totalPlants: 0 });
    expect(qc.users[1]).toMatchObject({ verified: true, image: "/api/avatars/abc.webp", totalPlants: 7 });
    expect(Date.parse(qc.users[1].joinedAt)).not.toBeNaN();
  });

  it("is empty when nobody has signed up", async () => {
    await createUser({ role: "ADMIN" });
    expect(await getUsersByLocation()).toEqual([]);
  });
});
