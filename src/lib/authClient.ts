export type ApiMeta = { requestId?: string };

export type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  meta?: ApiMeta;
};

export class AuthApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
    this.code = code;
  }
}

export async function authRequest<T>(path: string, init: RequestInit = {}): Promise<{ data: T; meta: ApiMeta }> {
  let response: Response;
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  try {
    response = await fetch('/api/v1' + path, {
      ...init,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new AuthApiError(0, 'NETWORK_ERROR', 'The server could not be reached. Check your connection and try again.');
  }

  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!payload || !response.ok || payload.success !== true || payload.data === undefined) {
    throw new AuthApiError(
      response.status,
      payload?.error?.code ?? 'UNKNOWN_ERROR',
      payload?.error?.message ?? `The request failed (${response.status}).`,
    );
  }
  return { data: payload.data, meta: payload.meta ?? {} };
}
