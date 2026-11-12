import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  accountPreferenceStorageKey,
  historyPausedStorageKey,
  readWatchHistory,
  watchHistoryStorageKey,
  watchProgressIdentity,
  watchProgressStorageKey,
  writeWatchHistory,
} from './accountStorage';

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

describe('account-scoped browser storage', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('uses separate history, pause and progress namespaces for each account', () => {
    writeWatchHistory('user-a', [{ slug: 'alpha' }]);
    writeWatchHistory('user-b', [{ slug: 'beta' }]);

    expect(watchHistoryStorageKey('user-a')).not.toBe(watchHistoryStorageKey('user-b'));
    expect(historyPausedStorageKey('user-a')).not.toBe(historyPausedStorageKey('user-b'));
    expect(accountPreferenceStorageKey('user-a', 'auto-next')).not.toBe(accountPreferenceStorageKey('user-b', 'auto-next'));
    expect(watchProgressStorageKey('user-a', 'alpha', 1, 'sub')).not.toBe(
      watchProgressStorageKey('user-b', 'alpha', 1, 'sub'),
    );
    expect(watchProgressIdentity('user-a', 'alpha', 1, 'sub')).not.toBe(
      watchProgressIdentity('user-b', 'alpha', 1, 'sub'),
    );
    expect(readWatchHistory<{ slug: string }>('user-a')).toEqual([{ slug: 'alpha' }]);
    expect(readWatchHistory<{ slug: string }>('user-b')).toEqual([{ slug: 'beta' }]);
  });

  it('moves legacy unscoped activity into guest storage, never into a signed-in account', () => {
    const legacyProgress = 'kairo-progress:alpha:1:sub';
    localStorage.setItem(legacyProgress, '120');
    localStorage.setItem('kairo-watch-history', JSON.stringify([
      { slug: 'alpha', title: 'Alpha', progressKey: legacyProgress },
    ]));
    localStorage.setItem('kairo-history-paused', 'true');

    const guest = readWatchHistory<{ slug: string; progressKey: string }>(null);
    expect(guest).toHaveLength(1);
    expect(guest[0].slug).toBe('alpha');
    expect(guest[0].progressKey).toBe('kairo-progress:guest:alpha:1:sub');
    expect(localStorage.getItem(guest[0].progressKey)).toBe('120');
    expect(localStorage.getItem(historyPausedStorageKey(null))).toBe('true');
    expect(readWatchHistory('user-a')).toEqual([]);
    expect(readWatchHistory('user-b')).toEqual([]);
  });
});
