import { afterEach, describe, expect, it, vi } from "vitest";
import { isGoogleEnabled } from "@/lib/auth-providers";

afterEach(() => vi.unstubAllEnvs());

describe("isGoogleEnabled", () => {
  it("is off unless both Google credentials are set", () => {
    vi.stubEnv("AUTH_GOOGLE_ID", "");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "");
    expect(isGoogleEnabled()).toBe(false);

    vi.stubEnv("AUTH_GOOGLE_ID", "id.apps.googleusercontent.com");
    expect(isGoogleEnabled()).toBe(false);

    vi.stubEnv("AUTH_GOOGLE_SECRET", "secret");
    expect(isGoogleEnabled()).toBe(true);
  });
});
