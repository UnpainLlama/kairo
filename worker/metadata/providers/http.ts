import { ProviderError } from '../types';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const USER_AGENT = 'KAIRO/0.2 (personal non-commercial project; https://github.com/UnpainLlama/kairo)';

/** fetch with provider-neutral error mapping. Only the fixed host given by the caller is ever contacted. */
export async function providerFetch(fetchImpl: FetchLike, url: string, init: RequestInit, allowedHost: string): Promise<Response> {
  if (new URL(url).hostname !== allowedHost) throw new ProviderError('unavailable', 'Blocked: host is not on the provider allowlist.');
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch {
    throw new ProviderError('unavailable', 'Could not reach the provider.');
  }
  if (res.status === 429) {
    const retry = Number(res.headers.get('Retry-After'));
    throw new ProviderError('rate_limited', 'The provider rate limit was reached.', Number.isFinite(retry) && retry > 0 ? Math.min(retry, 600) : 60);
  }
  if (res.status >= 500) throw new ProviderError('unavailable', `The provider returned ${res.status}.`);
  return res;
}

export async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new ProviderError('invalid_response', 'The provider returned a response that is not JSON.');
  }
}

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const asString = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
