import { describe, expect, it } from "vitest";
import { hashToken, normalizeEmail, passwordProblem, validateName } from "@/lib/registration";
import { escapeHtml } from "@/lib/email";
import { safeCallbackUrl } from "@/lib/url";

describe("normalizeEmail", () => {
  it.each([
    ["  Juan.Dela.Cruz@Gmail.COM ", "juan.dela.cruz@gmail.com"],
    ["a+tag@sub.example.ph", "a+tag@sub.example.ph"],
  ])("%j → %s", (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });

  it.each(["", "plainaddress", "a@b", "a b@c.ph", "@c.ph", "a@.ph ", `${"x".repeat(250)}@a.ph`, null, 42])(
    "rejects %j",
    (input) => {
      expect(normalizeEmail(input)).toBeNull();
    },
  );
});

describe("passwordProblem", () => {
  it("accepts reasonable passwords", () => {
    expect(passwordProblem("correct horse")).toBeNull();
    expect(passwordProblem("12345678")).toBeNull();
  });

  it.each([undefined, "", "short", "        ", "  abc   "])("rejects %j as too short", (pw) => {
    expect(passwordProblem(pw)).toMatch(/at least 8/);
  });

  it("rejects passwords over bcrypt's 72-byte limit (counting multibyte characters)", () => {
    expect(passwordProblem("x".repeat(72))).toBeNull();
    expect(passwordProblem("x".repeat(73))).toMatch(/too long/);
    expect(passwordProblem("ñ".repeat(37))).toMatch(/too long/); // 74 bytes
  });
});

describe("validateName", () => {
  it("trims and collapses whitespace", () => {
    expect(validateName("  Maria   Clara ")).toBe("Maria Clara");
  });
  it.each(["", "   ", "x".repeat(61), 5])("rejects %j", (n) => {
    expect(validateName(n)).toBeNull();
  });
});

describe("hashToken", () => {
  it("is a deterministic sha256 hex digest that differs from the token", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});

describe("escapeHtml", () => {
  it("neutralizes markup in user-supplied names", () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">&`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;",
    );
  });
});

describe("safeCallbackUrl", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/referrals?code=abc", "/referrals?code=abc"],
    ["https://evil.example", "/dashboard"],
    ["//evil.example", "/dashboard"],
    ["/\\evil.example", "/dashboard"],
    ["javascript:alert(1)", "/dashboard"],
    [undefined, "/dashboard"],
  ])("%j → %s", (input, expected) => {
    expect(safeCallbackUrl(input)).toBe(expected);
  });
});
