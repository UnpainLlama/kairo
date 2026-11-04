const API_BASE = '/api/v1';

export type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  meta?: Record<string, unknown>;
};

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    signal,
  });
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.error?.message ?? `Request failed (${response.status})`);
  }
  return payload.data;
}
