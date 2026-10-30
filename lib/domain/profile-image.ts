// Only Google's account-photo hosts are accepted, never arbitrary provider URLs.
// Images load directly with no referrer; this is not a server-side fetch endpoint.
export function googleProfileImage(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
        !/^lh[3-6]\.googleusercontent\.com$/.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
export function publicProfileImage(icon: string, image: unknown): string | null {
  return icon === 'google' ? googleProfileImage(image) : null;
}
