import { describe, expect, it } from 'vitest';
import app from './index';

const worker = app as unknown as {
  request(input: string, init?: RequestInit, env?: unknown): Promise<Response>;
};

describe('API origin protection', () => {
  const url = 'https://kairo.test/api/__origin_guard_test';
  const env = { ACCESS_ENFORCED: 'false' };

  it('rejects state-changing requests with no Origin or Referer', async () => {
    const response = await worker.request(url, { method: 'POST' }, env);
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('ORIGIN_FORBIDDEN');
  });

  it('rejects a foreign Origin even when the request is otherwise valid', async () => {
    const response = await worker.request(url, {
      method: 'PATCH',
      headers: { Origin: 'https://attacker.example' },
    }, env);
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('ORIGIN_FORBIDDEN');
  });

  it('allows a matching Origin or same-origin Referer', async () => {
    const originResponse = await worker.request(url, {
      method: 'POST',
      headers: { Origin: 'https://kairo.test' },
    }, env);
    const refererResponse = await worker.request(url, {
      method: 'DELETE',
      headers: { Referer: 'https://kairo.test/admin' },
    }, env);
    expect(originResponse.status).toBe(404);
    expect(refererResponse.status).toBe(404);
  });

  it('fails closed for protected API paths when Access is enforced but no assertion is present', async () => {
    const response = await worker.request('https://kairo.test/api/v1/me', { method: 'GET' }, {
      ACCESS_ENFORCED: 'true',
      ACCESS_TEAM_DOMAIN: 'kairo-team.cloudflareaccess.com',
      ACCESS_AUD: 'kairo-test-aud',
    });
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('ACCESS_REQUIRED');
  });

  it('keeps the public liveness probe minimal while Access is enforced', async () => {
    const response = await worker.request('https://kairo.test/api/health', { method: 'GET' }, {
      ACCESS_ENFORCED: 'true',
    });
    const payload = (await response.json()) as { success: boolean; data: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(payload.data).toEqual({ status: 'ok', service: 'kairo-api' });
  });

  it('does not require Origin on safe read-only methods', async () => {
    const response = await worker.request(url, { method: 'GET' }, env);
    expect(response.status).toBe(404);
  });
});
