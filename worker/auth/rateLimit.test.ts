import { describe, expect, it } from 'vitest';
import { consumeRateLimit } from './rateLimit';

describe('consumeRateLimit', () => {
  it('stores a hashed bucket key and enforces the configured request limit', async () => {
    let bound: unknown[] = [];
    const db = {
      prepare(sql: string) {
        expect(sql).toContain('INSERT INTO auth_rate_limits');
        expect(sql).toContain('RETURNING attempts');
        return {
          bind: (...values: unknown[]) => {
            bound = values;
            return { first: async () => ({ attempts: 4 }) };
          },
        };
      },
    } as unknown as D1Database;
    await expect(consumeRateLimit(db, '203.0.113.10', 'catalog-search', 3, 60_000, 100_000)).resolves.toBe(false);
    expect(bound[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(bound[0]).not.toContain('203.0.113.10');
    expect(bound.slice(1)).toEqual([100_000, 40_000, 40_000, 100_000]);
  });

  it('allows requests while under the limit', async () => {
    const db = {
      prepare: () => ({ bind: () => ({ first: async () => ({ attempts: 2 }) }) }),
    } as unknown as D1Database;
    await expect(consumeRateLimit(db, 'client', 'catalog-browse', 60, 900_000)).resolves.toBe(true);
  });
});
