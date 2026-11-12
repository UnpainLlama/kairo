/**
 * Browser-side viewing state is partitioned by the authenticated Kairo user.
 * Guest activity stays in its own namespace and is never uploaded to an account.
 */
export type AccountScope = string | null;

const HISTORY_PREFIX = 'kairo-watch-history:';
const PAUSED_PREFIX = 'kairo-history-paused:';
const PREFERENCE_PREFIX = 'kairo-preference:';
const PROGRESS_PREFIX = 'kairo-progress:';
const LEGACY_HISTORY_KEY = 'kairo-watch-history';
const LEGACY_PAUSED_KEY = 'kairo-history-paused';
const LEGACY_AUTO_NEXT_KEY = 'kairo-auto-next';
const MIGRATION_FLAG = 'kairo-account-storage-v2-migrated';

export function accountStorageScope(userId: AccountScope): string {
  return userId && userId.trim() ? userId : 'guest';
}

export function watchHistoryStorageKey(userId: AccountScope): string {
  migrateLegacyGuestState();
  return `${HISTORY_PREFIX}${accountStorageScope(userId)}`;
}

export function historyPausedStorageKey(userId: AccountScope): string {
  migrateLegacyGuestState();
  return `${PAUSED_PREFIX}${accountStorageScope(userId)}`;
}

export function accountPreferenceStorageKey(userId: AccountScope, preference: string): string {
  migrateLegacyGuestState();
  return `${PREFERENCE_PREFIX}${accountStorageScope(userId)}:${preference}`;
}

/** Full localStorage key used by watch-history cards and progress sync. */
export function watchProgressStorageKey(
  userId: AccountScope,
  slug: string,
  episodeNumber: number,
  serverId: string,
): string {
  return `${PROGRESS_PREFIX}${accountStorageScope(userId)}:${slug}:${episodeNumber}:${serverId}`;
}

/** KairoVideoJsPlayer prefixes this identity with "kairo-progress:". */
export function watchProgressIdentity(
  userId: AccountScope,
  slug: string,
  episodeNumber: number,
  serverId: string,
): string {
  return `${accountStorageScope(userId)}:${slug}:${episodeNumber}:${serverId}`;
}

export function readWatchHistory<T = unknown>(userId: AccountScope): T[] {
  const key = watchHistoryStorageKey(userId);
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

export function writeWatchHistory(userId: AccountScope, items: unknown[]): void {
  try {
    localStorage.setItem(watchHistoryStorageKey(userId), JSON.stringify(items));
  } catch {
    // Browser storage can be unavailable or full; the API remains authoritative for signed-in users.
  }
}

/**
 * Move pre-account local history into the guest namespace only.
 * The old key had no account identifier, so attributing it to a signed-in user
 * would risk importing one person's activity into another person's account.
 */
function migrateLegacyGuestState(): void {
  try {
    if (localStorage.getItem(MIGRATION_FLAG) === 'true') return;

    const oldHistory = localStorage.getItem(LEGACY_HISTORY_KEY);
    const guestHistoryKey = `${HISTORY_PREFIX}guest`;
    if (oldHistory !== null && localStorage.getItem(guestHistoryKey) === null) {
      const parsed: unknown = JSON.parse(oldHistory);
      if (Array.isArray(parsed)) {
        const migrated = parsed.map((value) => {
          if (!value || typeof value !== 'object') return value;
          const item = { ...(value as Record<string, unknown>) };
          const oldProgressKey = item.progressKey;
          if (typeof oldProgressKey === 'string' && oldProgressKey.startsWith(PROGRESS_PREFIX)) {
            const suffix = oldProgressKey.slice(PROGRESS_PREFIX.length);
            const newProgressKey = `${PROGRESS_PREFIX}guest:${suffix}`;
            const oldProgress = localStorage.getItem(oldProgressKey);
            if (oldProgress !== null && localStorage.getItem(newProgressKey) === null) {
              localStorage.setItem(newProgressKey, oldProgress);
            }
            item.progressKey = newProgressKey;
          }
          return item;
        });
        localStorage.setItem(guestHistoryKey, JSON.stringify(migrated));
      }
    }

    const oldPaused = localStorage.getItem(LEGACY_PAUSED_KEY);
    if (oldPaused !== null && localStorage.getItem(`${PAUSED_PREFIX}guest`) === null) {
      localStorage.setItem(`${PAUSED_PREFIX}guest`, oldPaused);
    }
    const oldAutoNext = localStorage.getItem(LEGACY_AUTO_NEXT_KEY);
    if (oldAutoNext !== null && localStorage.getItem(`${PREFERENCE_PREFIX}guest:auto-next`) === null) {
      localStorage.setItem(`${PREFERENCE_PREFIX}guest:auto-next`, oldAutoNext);
    }
    localStorage.setItem(MIGRATION_FLAG, 'true');
  } catch {
    // Do not block browsing when storage is disabled or malformed.
  }
}
