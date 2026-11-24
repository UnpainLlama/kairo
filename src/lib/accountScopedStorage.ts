/** Remove only browser-local cache keys owned by the account being signed out.
 * Server-side history and library records are deliberately untouched.
 */
export function clearAccountScopedBrowserData(userId: string | null | undefined): void {
  const id = typeof userId === 'string' ? userId.trim() : '';
  if (!id) return;
  const prefixes = [
    `kairo-watch-history:${id}`,
    `kairo-history-paused:${id}`,
    `kairo-preference:${id}:`,
    `kairo-progress:${id}:`,
    `kairo-movies-library:v1:${encodeURIComponent(id)}`,
    `kairo-media-playback:v1:${id}:`,
  ];
  try {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && prefixes.some(prefix => key === prefix || key.startsWith(prefix))) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
  } catch {
    // A blocked storage API must never prevent a Cloudflare Access sign-out.
  }
}
