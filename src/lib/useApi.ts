import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiGetWithMeta, isAbort, type ApiMeta } from './api';

export type ApiState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ok'; data: T; meta: ApiMeta };

type Stored<T> = { key: string; state: ApiState<T> };

/** GET helper with cancellation. Pass null to skip the request. Results for an old path are never shown for a new one. */
export function useApi<T>(path: string | null): ApiState<T> & { reload: () => void } {
  const [stored, setStored] = useState<Stored<T> | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    const key = `${path}#${nonce}`;
    apiGetWithMeta<T>(path, controller.signal)
      .then(({ data, meta }) => setStored({ key, state: { status: 'ok', data, meta } }))
      .catch((error: unknown) => {
        if (isAbort(error)) return;
        const apiError = error instanceof ApiError ? error : new ApiError(0, 'UNKNOWN_ERROR', 'Something went wrong.');
        setStored({ key, state: { status: 'error', error: apiError } });
      });
    return () => controller.abort();
  }, [path, nonce]);

  const current: ApiState<T> = path !== null && stored && stored.key === `${path}#${nonce}` ? stored.state : { status: 'loading' };
  return { ...current, reload };
}
