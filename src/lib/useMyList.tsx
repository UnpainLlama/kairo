import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAccountScope } from '../hooks/useAccountScope';
import { readMovieLibrary, updateMovieLibraryEntry, type MovieLibraryPatch, type MovieLibraryStatus } from './movieLibraryStorage';
import type { MovieSummary } from './movies';

type Saved = { status: MovieLibraryStatus | null; isFavorite: boolean };
type RemoteRow = { providerId: string; externalId: string; status: MovieLibraryStatus | null; isFavorite: boolean | number };

export type MyListApi = {
  /** True once the account state is known and the saved list has loaded. */
  ready: boolean;
  /** True when the account could not be verified, so saving is locked. */
  locked: boolean;
  busy: boolean;
  error: string;
  retry: () => void;
  get: (movie: Pick<MovieSummary, 'providerId' | 'externalId'>) => Saved;
  update: (movie: MovieSummary, patch: MovieLibraryPatch) => Promise<void>;
};

const NONE: Saved = { status: null, isFavorite: false };
const key = (movie: Pick<MovieSummary, 'providerId' | 'externalId'>) => movie.providerId + ':' + movie.externalId;

const Ctx = createContext<MyListApi>({
  ready: false, locked: false, busy: false, error: '', retry: () => undefined,
  get: () => NONE, update: async () => undefined,
});

export const useMyList = () => useContext(Ctx);

/** Loads the saved Movies list once (guest browser storage or the signed-in account) and lets any card update it. */
export function MyListProvider({ children }: { children: ReactNode }) {
  const { accountId, resolved, error: accountError, retry } = useAccountScope();
  const [saved, setSaved] = useState<Map<string, Saved>>(new Map());
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!resolved || accountError) { setReady(false); return; }
    let active = true;
    setReady(false);
    setError('');
    const fromLocal = () => {
      const map = new Map<string, Saved>();
      readMovieLibrary(accountId).forEach(entry => map.set(key(entry), { status: entry.status, isFavorite: entry.isFavorite }));
      return map;
    };
    if (!accountId) {
      setSaved(fromLocal());
      setReady(true);
      const onChange = () => { if (active) setSaved(fromLocal()); };
      window.addEventListener('kairo:movie-library-change', onChange);
      return () => { active = false; window.removeEventListener('kairo:movie-library-change', onChange); };
    }
    fetch('/api/v1/me/movies/library', { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success || !Array.isArray(payload?.data?.items)) {
          throw new Error(payload?.error?.message ?? 'Could not load your list.');
        }
        if (!active) return;
        const map = new Map<string, Saved>();
        (payload.data.items as RemoteRow[]).forEach(row => map.set(key(row), { status: row.status, isFavorite: row.isFavorite === true || Number(row.isFavorite) === 1 }));
        setSaved(map);
        setReady(true);
      })
      .catch(caught => { if (active) { setError(caught instanceof Error ? caught.message : 'Could not load your list.'); setReady(true); } });
    return () => { active = false; };
  }, [accountId, resolved, accountError, reload]);

  const get = useCallback((movie: Pick<MovieSummary, 'providerId' | 'externalId'>) => saved.get(key(movie)) ?? NONE, [saved]);

  const update = useCallback(async (movie: MovieSummary, patch: MovieLibraryPatch) => {
    if (!resolved || accountError || !ready || busy) return;
    const current = saved.get(key(movie)) ?? NONE;
    const status = patch.status === undefined ? current.status : patch.status;
    const isFavorite = patch.isFavorite === undefined ? current.isFavorite : patch.isFavorite;
    setBusy(true);
    setError('');
    try {
      if (accountId) {
        const response = await fetch('/api/v1/me/movies/library', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId: movie.providerId, externalId: movie.externalId, status, isFavorite, rating: null }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not save this title.');
      }
      updateMovieLibraryEntry(accountId, movie, { status, isFavorite });
      setSaved(previous => {
        const next = new Map(previous);
        if (status === null && !isFavorite) next.delete(key(movie)); else next.set(key(movie), { status, isFavorite });
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this title.');
    } finally {
      setBusy(false);
    }
  }, [accountId, accountError, busy, ready, resolved, saved]);

  const value = useMemo<MyListApi>(() => ({
    ready: ready && !accountError, locked: accountError, busy, error,
    retry: () => { retry(); setReload(n => n + 1); },
    get, update,
  }), [accountError, busy, error, get, ready, retry, update]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
