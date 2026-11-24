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

function responseFailure(status: number): { code: string; message: string } {
  if (status === 401) {
    return { code: 'AUTH_REQUIRED', message: 'Your Kairo session is no longer valid. Sign in again.' };
  }
  if (status === 403) {
    return { code: 'REQUEST_FORBIDDEN', message: 'Kairo or its edge security layer rejected this request. Refresh the staging site and sign in again.' };
  }
  if (status === 404) {
    return { code: 'API_ROUTE_NOT_FOUND', message: 'The Kairo API route was not found. The staging Worker may not have the latest deployment.' };
  }
  if (status >= 500) {
    return { code: 'API_UNAVAILABLE', message: 'The Kairo server is temporarily unavailable. Try again shortly.' };
  }
  return { code: 'HTTP_REQUEST_FAILED', message: `The Kairo request failed (HTTP ${status}). Check the form and try again.` };
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

  const finalPath = response.url ? (() => {
    try { return new URL(response.url).pathname; } catch { return ''; }
  })() : '';
  if (response.redirected || finalPath.includes('/cdn-cgi/access/login')) {
    throw new AuthApiError(
      response.status || 401,
      'AUTH_REDIRECT',
      'The Kairo API request was redirected to a login page instead of reaching the Worker. Refresh staging and sign in again; check Cloudflare Access routing for /api/* if this continues.',
    );
  }

  const responseText = await response.text().catch(() => '');
  let payload: ApiEnvelope<T> | null = null;
  if (responseText) {
    try { payload = JSON.parse(responseText) as ApiEnvelope<T>; } catch { payload = null; }
  }

  if (!payload || !response.ok || payload.success !== true || payload.data === undefined) {
    if (!payload) {
      if (response.ok) {
        throw new AuthApiError(
          response.status,
          'NON_JSON_RESPONSE',
          'Kairo returned a web page or an unreadable response instead of JSON. This can happen when a login redirect or an outdated deployment intercepts the API request.',
        );
      }
      const fallback = responseFailure(response.status);
      throw new AuthApiError(response.status, fallback.code, fallback.message);
    }

    const fallback = responseFailure(response.status);
    throw new AuthApiError(
      response.status,
      payload.error?.code ?? fallback.code,
      payload.error?.message ?? fallback.message,
    );
  }

  return { data: payload.data, meta: payload.meta ?? {} };
}
