// Authorized playback boundary. A provider's answer is untrusted until validatePlaybackResult accepts it:
// HTTPS only, hosts must be on that provider's allowlist, no embedded credentials, not expired.
// Nothing here fetches, proxies, or extracts third-party media; it only checks what an approved provider returned.

export type PlaybackSubtitle = { language: string; label: string; url: string; format: 'vtt' };
export type PlaybackVariant = { label: string; height?: number };

export type AuthorizedPlaybackResult = {
  provider: string;
  protocol: 'hls';
  manifestUrl: string;
  expiresAt?: string;
  subtitles: PlaybackSubtitle[];
  variants: PlaybackVariant[];
};

export interface AuthorizedPlaybackProvider {
  readonly id: string;
  /** Exact hosts ("media.example.com") or subdomain wildcards ("*.example.com"). Subdomain wildcards never match the bare domain. */
  readonly allowedHosts: readonly string[];
  /** Resolve to null when the provider has no source for this episode. */
  resolve(input: { providerEpisodeId: string; requestedAudio?: string }): Promise<AuthorizedPlaybackResult | null>;
}

export type PlaybackOutcome =
  | { ok: true; data: AuthorizedPlaybackResult }
  | { ok: false; code: 'SOURCE_UNAVAILABLE' | 'PROVIDER_UNAVAILABLE'; message: string };

export function parseAllowedUrl(raw: unknown, allowedHosts: readonly string[]): URL | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port !== '') return null;
  const host = url.hostname.toLowerCase();
  const allowed = allowedHosts.some((entry) => {
    const pattern = entry.toLowerCase();
    return pattern.startsWith('*.') ? host.endsWith(pattern.slice(1)) : host === pattern;
  });
  return allowed ? url : null;
}

type Validation = { ok: true; value: AuthorizedPlaybackResult } | { ok: false; reason: 'invalid' | 'expired' };
const invalid: Validation = { ok: false, reason: 'invalid' };
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Returns a copy containing only validated, known fields. Unknown provider fields are dropped. */
export function validatePlaybackResult(raw: unknown, ctx: { providerId: string; allowedHosts: readonly string[]; now: Date }): Validation {
  if (!isRecord(raw) || raw.provider !== ctx.providerId || raw.protocol !== 'hls') return invalid;
  const manifest = parseAllowedUrl(raw.manifestUrl, ctx.allowedHosts);
  if (!manifest) return invalid;

  let expiresAt: string | undefined;
  if (raw.expiresAt !== undefined) {
    const ms = typeof raw.expiresAt === 'string' ? Date.parse(raw.expiresAt) : NaN;
    if (Number.isNaN(ms)) return invalid;
    if (ms <= ctx.now.getTime()) return { ok: false, reason: 'expired' };
    expiresAt = new Date(ms).toISOString();
  }

  const subtitles: PlaybackSubtitle[] = [];
  if (raw.subtitles !== undefined) {
    if (!Array.isArray(raw.subtitles) || raw.subtitles.length > 50) return invalid;
    for (const s of raw.subtitles) {
      if (!isRecord(s) || s.format !== 'vtt') return invalid;
      const url = parseAllowedUrl(s.url, ctx.allowedHosts);
      const language = s.language;
      const label = s.label;
      if (!url || typeof language !== 'string' || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(language)) return invalid;
      if (typeof label !== 'string' || label.length < 1 || label.length > 60) return invalid;
      subtitles.push({ language, label, url: url.href, format: 'vtt' });
    }
  }

  const variants: PlaybackVariant[] = [];
  if (raw.variants !== undefined) {
    if (!Array.isArray(raw.variants) || raw.variants.length > 20) return invalid;
    for (const v of raw.variants) {
      if (!isRecord(v) || typeof v.label !== 'string' || v.label.length < 1 || v.label.length > 30) return invalid;
      if (v.height !== undefined && (typeof v.height !== 'number' || !Number.isInteger(v.height) || v.height < 1 || v.height > 8640)) return invalid;
      variants.push(v.height === undefined ? { label: v.label } : { label: v.label, height: v.height });
    }
  }

  return { ok: true, value: { provider: ctx.providerId, protocol: 'hls', manifestUrl: manifest.href, expiresAt, subtitles, variants } };
}

export async function resolvePlayback(
  provider: AuthorizedPlaybackProvider | undefined,
  input: { providerEpisodeId: string; requestedAudio?: string },
  opts: { now?: Date; timeoutMs?: number } = {},
): Promise<PlaybackOutcome> {
  if (!provider) return { ok: false, code: 'SOURCE_UNAVAILABLE', message: 'No authorized playback provider is configured.' };

  let raw: unknown;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    raw = await Promise.race([
      provider.resolve(input),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), opts.timeoutMs ?? 8000);
      }),
    ]);
  } catch {
    return { ok: false, code: 'PROVIDER_UNAVAILABLE', message: 'The playback provider did not respond. Please try again.' };
  } finally {
    clearTimeout(timer);
  }

  if (raw === null || raw === undefined) return { ok: false, code: 'SOURCE_UNAVAILABLE', message: 'No playable source is available for this episode.' };

  const checked = validatePlaybackResult(raw, { providerId: provider.id, allowedHosts: provider.allowedHosts, now: opts.now ?? new Date() });
  if (checked.ok) return { ok: true, data: checked.value };
  return checked.reason === 'expired'
    ? { ok: false, code: 'SOURCE_UNAVAILABLE', message: 'This source has expired. Please try again.' }
    : { ok: false, code: 'PROVIDER_UNAVAILABLE', message: 'The playback provider returned an invalid response.' };
}
