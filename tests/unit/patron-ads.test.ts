import { describe, expect, it } from "vitest";
import { parsePatronAd } from "@/lib/patron-ads";

const valid = {
  companyName: "  Green Corp  ",
  imageUrl: "https://cdn.example.ph/banner.png",
  targetUrl: "https://example.ph/promo",
};

describe("parsePatronAd", () => {
  it("accepts a complete ad and trims the name", () => {
    expect(parsePatronAd(valid)).toEqual({ ok: true, data: { ...valid, companyName: "Green Corp" } });
  });

  it.each(["companyName", "imageUrl", "targetUrl"])("requires %s on create", (field) => {
    const body: Record<string, unknown> = { ...valid };
    delete body[field];
    expect(parsePatronAd(body).ok).toBe(false);
  });

  it.each([
    "http://example.ph/x.png", // not https
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "not a url",
    `https://example.ph/${"x".repeat(2100)}`,
  ])("rejects unsafe or invalid URL %s", (url) => {
    expect(parsePatronAd({ ...valid, imageUrl: url }).ok).toBe(false);
    expect(parsePatronAd({ ...valid, targetUrl: url }).ok).toBe(false);
  });

  it("rejects blank or overlong names", () => {
    expect(parsePatronAd({ ...valid, companyName: "   " }).ok).toBe(false);
    expect(parsePatronAd({ ...valid, companyName: "x".repeat(81) }).ok).toBe(false);
  });

  it("partial updates return only provided fields", () => {
    expect(parsePatronAd({ isActive: false }, { partial: true })).toEqual({ ok: true, data: { isActive: false } });
    expect(parsePatronAd({ isActive: "yes" }, { partial: true }).ok).toBe(false);
  });
});
