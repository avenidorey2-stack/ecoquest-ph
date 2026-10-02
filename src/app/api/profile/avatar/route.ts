import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { AvatarError, deleteAvatar, saveAvatar } from "@/lib/avatars";
import { prisma } from "@/lib/prisma";

// POST /api/profile/avatar — multipart `file`: set (or replace) your profile picture.
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });

  let saved;
  try {
    saved = await saveAvatar(file);
  } catch (err) {
    if (err instanceof AvatarError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  const previous = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { avatarUrl: true } });
  await prisma.user.update({ where: { id: me.id }, data: { avatarUrl: saved.url } });
  await deleteAvatar(previous.avatarUrl); // old file is no longer referenced
  return NextResponse.json({ avatarUrl: saved.url }, { status: 201 });
}

// DELETE /api/profile/avatar — remove your uploaded picture (falls back to your Google photo).
export async function DELETE() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const previous = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { avatarUrl: true } });
  await prisma.user.update({ where: { id: me.id }, data: { avatarUrl: null } });
  await deleteAvatar(previous.avatarUrl);
  return NextResponse.json({ avatarUrl: null });
}
