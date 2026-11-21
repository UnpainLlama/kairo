import { useCallback, useEffect, useState } from 'react';
import { historyPausedStorageKey } from '../lib/accountStorage';

type HistoryPreferencePayload = {
  success?: boolean;
  data?: { historyPaused?: unknown };
  error?: { message?: string };
};

function readLocalPaused(key: string): boolean {
  try { return localStorage.getItem(key) === 'true'; }
  catch { return false; }
}

function writeLocalPaused(key: string, value: boolean): void {
  try { localStorage.setItem(key, String(value)); }
  catch { /* The account preference remains authoritative on the server. */ }
}

function isHistoryPreferencePayload(value: unknown): value is HistoryPreferencePayload {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** Reads and updates the account-wide pause-history preference, with guest-only local storage. */
export function useHistoryRecording(accountId: string | null, accountResolved: boolean) {
  const storageKey = historyPausedStorageKey(accountId);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!accountResolved) {
      setReady(false);
      return () => { active = false; };
    }
    setError('');
    if (!accountId) {
      setPaused(readLocalPaused(storageKey));
      setReady(true);
      return () => { active = false; };
    }

    // Do not record until the cross-device preference has been verified.
    setReady(false);
    void fetch('/api/v1/me/preferences', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    }).then(async response => {
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isHistoryPreferencePayload(payload) || payload.success !== true ||
          typeof payload.data?.historyPaused !== 'boolean') {
        throw new Error(isHistoryPreferencePayload(payload)
          ? payload.error?.message ?? 'Could not verify your history preference.'
          : 'Could not verify your history preference.');
      }
      if (!active) return;
      const value = payload.data.historyPaused;
      setPaused(value);
      writeLocalPaused(storageKey, value);
      setReady(true);
    }).catch(() => {
      if (!active) return;
      // Fail closed: an unavailable preference must not silently start recording
      // on a device where the account has previously chosen to pause history.
      setPaused(true);
      setError('Your history preference could not be checked. Recording is paused until the setting can be verified.');
      setReady(true);
    });

    return () => { active = false; };
  }, [accountId, accountResolved, storageKey]);

  useEffect(() => {
    const refreshFromLocalCache = () => setPaused(readLocalPaused(storageKey));
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) refreshFromLocalCache();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('kairo:history-paused-change', refreshFromLocalCache);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('kairo:history-paused-change', refreshFromLocalCache);
    };
  }, [storageKey]);

  const updatePaused = useCallback(async (next: boolean): Promise<boolean> => {
    setSaving(true);
    setError('');
    try {
      if (accountId) {
        const response = await fetch('/api/v1/me/preferences', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ historyPaused: next }),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !isHistoryPreferencePayload(payload) || payload.success !== true ||
            payload.data?.historyPaused !== next) {
          throw new Error(isHistoryPreferencePayload(payload)
            ? payload.error?.message ?? 'Could not save your history preference.'
            : 'Could not save your history preference.');
        }
      }
      writeLocalPaused(storageKey, next);
      setPaused(next);
      setReady(true);
      window.dispatchEvent(new Event('kairo:history-paused-change'));
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save your history preference.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [accountId, storageKey]);

  return { paused, ready, saving, error, updatePaused };
}
