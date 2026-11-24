import { describe, expect, it } from 'vitest';
import { providerRefFromMappings, parseRef } from './ids';

describe('database catalogue episode provider references', () => {
  it('uses the configured source order when mapping D1 ids', () => {
    const mappings = [
      { provider: 'mal', externalId: '1535' },
      { provider: 'legacy', externalId: '1535' },
    ];
    expect(providerRefFromMappings(mappings)).toBe('m1535');
    expect(providerRefFromMappings(mappings, ['mal'])).toBe('m1535');
    expect(parseRef(providerRefFromMappings(mappings, ['mal']) ?? undefined)).toEqual({ kind: 'm', id: 1535 });
  });

  it('rejects unsupported, malformed and zero provider identifiers', () => {
    expect(providerRefFromMappings([{ provider: 'kitsu', externalId: '1376' }])).toBeNull();
    expect(providerRefFromMappings([{ provider: 'legacy', externalId: '1535' }])).toBeNull();
    expect(providerRefFromMappings([{ provider: 'mal', externalId: 'abc' }])).toBeNull();
  });
});
