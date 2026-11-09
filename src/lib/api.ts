const API_BASE = '/api/v1';

export type ApiMeta = {
  requestId?: string;
  page?: number;
  limit?: number;
  total?: number;
  hasNextPage?: boolean;
  basis?: string;
  count?: number;
};

type Envelope<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  meta?: ApiMeta;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function apiGetWithMeta<T>(path: string, signal?: AbortSignal): Promise<{ data: T; meta: ApiMeta }> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'same-origin', signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.');
  }
  let payload: Envelope<T> | null = null;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    payload = null;
  }
  if (!payload || !response.ok || !payload.success || payload.data === undefined) {
    throw new ApiError(response.status, payload?.error?.code ?? 'UNKNOWN_ERROR', payload?.error?.message ?? `Request failed (${response.status}).`);
  }
  return { data: payload.data, meta: payload.meta ?? {} };
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return (await apiGetWithMeta<T>(path, signal)).data;
}

export const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';
