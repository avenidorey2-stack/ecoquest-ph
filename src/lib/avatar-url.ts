// Pure avatar URL helpers (no fs / sharp), safe to import anywhere.

const KEY_PATTERN = /^[0-9a-f-]{36}\.webp$/;

export function isAvatarKey(key: string) {
  return KEY_PATTERN.test(key);
}

export function avatarUrlForKey(key: string) {
  return `/api/avatars/${key}`;
}

export function keyFromAvatarUrl(url: string | null | undefined) {
  const key = url?.startsWith("/api/avatars/") ? url.slice("/api/avatars/".length) : null;
  return key && isAvatarKey(key) ? key : null;
}

/** The picture to show for a user: their upload, else their Google photo. */
export function displayAvatar(user: { avatarUrl?: string | null; image?: string | null }) {
  return user.avatarUrl ?? user.image ?? null;
}
