import { describe, it, expect } from 'vitest';
import { parseAllowedUrl, resolvePlayback, type AuthorizedPlaybackProvider, type AuthorizedPlaybackResult } from './playback';

const NOW = new Date('2026-11-04T10:00:00Z');
const HOSTS = ['media.provider.test', '*.cdn.provider.test'];
const good = (over: Record<string, unknown> = {}) => ({
  provider: 'mock', protocol: 'hls', manifestUrl: 'https://media.provider.test/ep1/master.m3u8', expiresAt: '2026-11-04T12:00:00Z',
  subtitles: [{ language: 'en', label: 'English', url: 'https://a.cdn.provider.test/en.vtt', format: 'vtt' }], variants: [{ label: '1080p', height: 1080 }],
  ...over,
});
const mock = (result: unknown, hang = false): AuthorizedPlaybackProvider => ({
  id: 'mock', allowedHosts: HOSTS,
  resolve: () => (hang ? new Promise(() => {}) : Promise.resolve(result as AuthorizedPlaybackResult | null)),
});
const run = (p: AuthorizedPlaybackProvider | undefined, timeoutMs = 50) => resolvePlayback(p, { providerEpisodeId: 'e1' }, { now: NOW, timeoutMs });

describe('parseAllowedUrl', () => {
  it('allows exact and subdomain-wildcard hosts over https only', () => {
    expect(parseAllowedUrl('https://media.provider.test/x.m3u8', HOSTS)?.hostname).toBe('media.provider.test');
    expect(parseAllowedUrl('https://a.cdn.provider.test/x', HOSTS)).not.toBeNull();
  });
  it('rejects http, other hosts, lookalikes, bare wildcard domain, credentials, ports, and junk', () => {
    for (const bad of [
      'http://media.provider.test/x', 'https://evil.test/x', 'https://media.provider.test.evil.test/x', 'https://evil-cdn.provider.test/x',
      'https://cdn.provider.test/x', 'https://u:p@media.provider.test/x', 'https://media.provider.test:8443/x', 'javascript:alert(1)', 'not a url', '',
    ]) expect(parseAllowedUrl(bad, HOSTS)).toBeNull();
    expect(parseAllowedUrl(42, HOSTS)).toBeNull();
  });
});

describe('resolvePlayback', () => {
  it('returns a validated source and drops unknown provider fields', async () => {
    const out = await run(mock(good({ licenseKey: 'secret', extra: 1 })));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.data).toEqual({
        provider: 'mock', protocol: 'hls', manifestUrl: 'https://media.provider.test/ep1/master.m3u8', expiresAt: '2026-11-04T12:00:00.000Z',
        subtitles: [{ language: 'en', label: 'English', url: 'https://a.cdn.provider.test/en.vtt', format: 'vtt' }], variants: [{ label: '1080p', height: 1080 }],
      });
    }
  });
  it('accepts an allowlisted HTTPS iframe source and normalizes its expiry', async () => {
    const out = await run(mock({ provider: 'mock', protocol: 'embed', embedUrl: 'https://media.provider.test/embed/episode-1', expiresAt: '2026-11-04T12:00:00Z', extra: 'discard' }));
    expect(out).toEqual({ ok: true, data: { provider: 'mock', protocol: 'embed', embedUrl: 'https://media.provider.test/embed/episode-1', expiresAt: '2026-11-04T12:00:00.000Z' } });
  });
  it('rejects untrusted or expired iframe sources', async () => {
    expect(await run(mock({ provider: 'mock', protocol: 'embed', embedUrl: 'https://evil.test/embed' }))).toMatchObject({ ok: false, code: 'PROVIDER_UNAVAILABLE' });
    expect(await run(mock({ provider: 'mock', protocol: 'embed', embedUrl: 'http://media.provider.test/embed' }))).toMatchObject({ ok: false, code: 'PROVIDER_UNAVAILABLE' });
    expect(await run(mock({ provider: 'mock', protocol: 'embed', embedUrl: 'https://media.provider.test/embed', expiresAt: '2026-11-04T09:59:59Z' }))).toMatchObject({ ok: false, code: 'SOURCE_UNAVAILABLE' });
  });

  it('reports SOURCE_UNAVAILABLE when no provider is configured, or the provider has nothing', async () => {
    expect(await run(undefined)).toMatchObject({ ok: false, code: 'SOURCE_UNAVAILABLE' });
    expect(await run(mock(null))).toMatchObject({ ok: false, code: 'SOURCE_UNAVAILABLE' });
  });
  it('treats an expired source as SOURCE_UNAVAILABLE', async () => {
    expect(await run(mock(good({ expiresAt: '2026-11-04T09:59:59Z' })))).toMatchObject({ ok: false, code: 'SOURCE_UNAVAILABLE' });
  });
  it('treats invalid provider responses as PROVIDER_UNAVAILABLE', async () => {
    const bad = [
      good({ manifestUrl: 'http://media.provider.test/a.m3u8' }), good({ manifestUrl: 'https://other.test/a.m3u8' }),
      good({ provider: 'someone-else' }), good({ protocol: 'dash' }), good({ expiresAt: 'tomorrow' }),
      good({ subtitles: [{ language: 'en', label: 'English', url: 'https://evil.test/en.vtt', format: 'vtt' }] }),
      good({ subtitles: [{ language: 'en', label: 'English', url: 'https://media.provider.test/en.srt', format: 'srt' }] }),
      good({ variants: [{ label: '', height: 1080 }] }), 'a string', [],
    ];
    for (const b of bad) expect(await run(mock(b))).toMatchObject({ ok: false, code: 'PROVIDER_UNAVAILABLE' });
  });
  it('maps provider throws and timeouts to PROVIDER_UNAVAILABLE', async () => {
    const throwing: AuthorizedPlaybackProvider = { id: 'mock', allowedHosts: HOSTS, resolve: () => Promise.reject(new Error('boom')) };
    expect(await run(throwing)).toMatchObject({ ok: false, code: 'PROVIDER_UNAVAILABLE' });
    expect(await run(mock(null, true))).toMatchObject({ ok: false, code: 'PROVIDER_UNAVAILABLE' });
  });
});
