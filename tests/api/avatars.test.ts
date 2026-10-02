import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { DELETE as removeAvatar, POST as uploadAvatar } from "@/app/api/profile/avatar/route";
import { GET as getAvatar } from "@/app/api/avatars/[key]/route";
import { keyFromAvatarUrl } from "@/lib/avatar-url";
import { prisma } from "@/lib/prisma";
import { createUser, ctx, resetDb, signInAs } from "../helpers";

beforeEach(resetDb);

const avatarPath = (url: string) => path.join(process.env.AVATAR_ROOT!, keyFromAvatarUrl(url)!);

async function png(width = 800, height = 600) {
  return sharp({ create: { width, height, channels: 3, background: "#16a34a" } }).png().toBuffer();
}

function upload(bytes: Uint8Array | null, type = "image/png", name = "me.png") {
  const form = new FormData();
  if (bytes) form.set("file", new File([new Uint8Array(bytes)], name, { type }));
  return uploadAvatar(new Request("http://test.local/api/profile/avatar", { method: "POST", body: form }));
}

describe("POST /api/profile/avatar", () => {
  it("re-encodes to a 256×256 WebP, saves it and sets avatarUrl", async () => {
    const user = await createUser();
    signInAs(user);

    const res = await upload(await png());
    expect(res.status).toBe(201);
    const { avatarUrl } = await res.json();
    expect(avatarUrl).toMatch(/^\/api\/avatars\/[0-9a-f-]{36}\.webp$/);

    const meta = await sharp(avatarPath(avatarUrl)).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 256, height: 256 });
    expect(meta.exif).toBeUndefined();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).avatarUrl).toBe(avatarUrl);
  });

  it("deletes the previous file when replacing", async () => {
    signInAs(await createUser());
    const first = (await (await upload(await png())).json()).avatarUrl;
    const second = (await (await upload(await png(300, 300))).json()).avatarUrl;
    expect(second).not.toBe(first);
    expect(existsSync(avatarPath(first))).toBe(false);
    expect(existsSync(avatarPath(second))).toBe(true);
  });

  it("rejects non-images even when they claim to be PNG", async () => {
    signInAs(await createUser());
    const fake = new TextEncoder().encode("<script>alert(1)</script>");
    const res = await upload(fake, "image/png");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/JPG, PNG or WebP/);
  });

  it("rejects corrupt images, empty and oversized files", async () => {
    signInAs(await createUser());
    const corrupt = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    expect((await upload(corrupt)).status).toBe(400);
    expect((await upload(new Uint8Array(0))).status).toBe(400);
    expect((await upload(new Uint8Array(5 * 1024 * 1024 + 1).fill(0xff))).status).toBe(400);
    expect((await upload(null)).status).toBe(400);
  });

  it("requires a session", async () => {
    signInAs(null);
    expect((await upload(await png())).status).toBe(401);
  });
});

describe("DELETE /api/profile/avatar", () => {
  it("clears avatarUrl and removes the file", async () => {
    const user = await createUser();
    signInAs(user);
    const { avatarUrl } = await (await upload(await png())).json();

    expect((await removeAvatar()).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).avatarUrl).toBeNull();
    expect(existsSync(avatarPath(avatarUrl))).toBe(false);
  });
});

describe("GET /api/avatars/:key", () => {
  it("serves avatars publicly with long-lived caching", async () => {
    signInAs(await createUser());
    const { avatarUrl } = await (await upload(await png())).json();
    signInAs(null); // avatars appear on public leaderboards

    const res = await getAvatar(new Request("http://test.local"), ctx({ key: keyFromAvatarUrl(avatarUrl)! }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it.each(["../../.env", "nope.webp", `${crypto.randomUUID()}.png`, `${crypto.randomUUID()}.webp`])("404s for %s", async (key) => {
    expect((await getAvatar(new Request("http://test.local"), ctx({ key }))).status).toBe(404);
  });
});
