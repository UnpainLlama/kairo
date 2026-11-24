import { getRequestUser } from './requestUser';

function ok(c: any, data: unknown) {
  return c.json({ success: true, data, meta: { requestId: c.get('requestId') } });
}

function fail(c: any, status: number, code: string, message: string) {
  return c.json({ success: false, error: { code, message }, meta: { requestId: c.get('requestId') } }, status);
}

function originAllowed(c: any): boolean {
  const origin = c.req.header('Origin');
  return !origin || origin === new URL(c.req.url).origin;
}

const THEMES = ['astral-plum', 'sakura-ember', 'ocean-circuit', 'moonlit-jade'] as const;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const SUBTITLE_SIZES = ['small', 'medium', 'large'] as const;

type Preferences = {
  theme: typeof THEMES[number];
  interfaceLanguage: 'en';
  subtitleLanguage: string;
  subtitleSize: typeof SUBTITLE_SIZES[number];
  autoplayNext: boolean;
  defaultPlaybackSpeed: typeof SPEEDS[number];
  historyPaused: boolean;
};

const DEFAULTS: Preferences = {
  theme: 'astral-plum',
  interfaceLanguage: 'en',
  subtitleLanguage: 'en',
  subtitleSize: 'medium',
  autoplayNext: true,
  defaultPlaybackSpeed: 1,
  historyPaused: false,
};

export function registerHistoryPreferenceRoutes(app: any) {
  app.get('/api/v1/me/preferences', async (c: any) => {
    const user = await getRequestUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to read preferences.');
    try {
      const row = await c.env.DB.prepare(
        'SELECT theme, interface_language AS interfaceLanguage, subtitle_language AS subtitleLanguage, subtitle_size AS subtitleSize, autoplay_next AS autoplayNext, default_playback_speed AS defaultPlaybackSpeed, history_paused AS historyPaused FROM user_preferences WHERE user_id = ? LIMIT 1',
      ).bind(user.id).first() as Record<string, unknown> | null;
      const preferences: Preferences = {
        theme: THEMES.includes(row?.theme as typeof THEMES[number]) ? row!.theme as Preferences['theme'] : DEFAULTS.theme,
        interfaceLanguage: 'en',
        subtitleLanguage: typeof row?.subtitleLanguage === 'string' ? row.subtitleLanguage : DEFAULTS.subtitleLanguage,
        subtitleSize: SUBTITLE_SIZES.includes(row?.subtitleSize as typeof SUBTITLE_SIZES[number]) ? row!.subtitleSize as Preferences['subtitleSize'] : DEFAULTS.subtitleSize,
        autoplayNext: row?.autoplayNext === true || Number(row?.autoplayNext ?? 1) === 1,
        defaultPlaybackSpeed: SPEEDS.includes(Number(row?.defaultPlaybackSpeed) as typeof SPEEDS[number]) ? Number(row!.defaultPlaybackSpeed) as Preferences['defaultPlaybackSpeed'] : DEFAULTS.defaultPlaybackSpeed,
        historyPaused: Number(row?.historyPaused ?? 0) === 1,
      };
      return ok(c, preferences);
    } catch {
      return fail(c, 503, 'PREFERENCES_UNAVAILABLE', 'Your account preferences are temporarily unavailable.');
    }
  });

  app.put('/api/v1/me/preferences', async (c: any) => {
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const user = await getRequestUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to update preferences.');
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(c, 400, 'VALIDATION_ERROR', 'Provide a valid preferences object.');

    try {
      const current = await c.env.DB.prepare(
        'SELECT theme, interface_language AS interfaceLanguage, subtitle_language AS subtitleLanguage, subtitle_size AS subtitleSize, autoplay_next AS autoplayNext, default_playback_speed AS defaultPlaybackSpeed, history_paused AS historyPaused FROM user_preferences WHERE user_id = ? LIMIT 1',
      ).bind(user.id).first() as Record<string, unknown> | null;
      const value = body as Record<string, unknown>;
      const next: Preferences = {
        theme: THEMES.includes(current?.theme as typeof THEMES[number]) ? current!.theme as Preferences['theme'] : DEFAULTS.theme,
        interfaceLanguage: 'en',
        subtitleLanguage: typeof current?.subtitleLanguage === 'string' ? current.subtitleLanguage : DEFAULTS.subtitleLanguage,
        subtitleSize: SUBTITLE_SIZES.includes(current?.subtitleSize as typeof SUBTITLE_SIZES[number]) ? current!.subtitleSize as Preferences['subtitleSize'] : DEFAULTS.subtitleSize,
        autoplayNext: Number(current?.autoplayNext ?? 1) === 1,
        defaultPlaybackSpeed: SPEEDS.includes(Number(current?.defaultPlaybackSpeed) as typeof SPEEDS[number]) ? Number(current!.defaultPlaybackSpeed) as Preferences['defaultPlaybackSpeed'] : DEFAULTS.defaultPlaybackSpeed,
        historyPaused: Number(current?.historyPaused ?? 0) === 1,
      };

      if ('theme' in value) {
        if (typeof value.theme !== 'string' || !(THEMES as readonly string[]).includes(value.theme)) return fail(c, 400, 'VALIDATION_ERROR', 'Choose one of the supported Kairo themes.');
        next.theme = value.theme as Preferences['theme'];
      }
      if ('interfaceLanguage' in value && value.interfaceLanguage !== 'en') return fail(c, 400, 'LANGUAGE_UNAVAILABLE', 'English is currently the only supported interface language.');
      if ('subtitleLanguage' in value) {
        if (typeof value.subtitleLanguage !== 'string' || !/^(off|[a-z]{2,3}(?:-[A-Z]{2})?)$/.test(value.subtitleLanguage)) return fail(c, 400, 'VALIDATION_ERROR', 'Choose a valid subtitle language.');
        next.subtitleLanguage = value.subtitleLanguage;
      }
      if ('subtitleSize' in value) {
        if (typeof value.subtitleSize !== 'string' || !(SUBTITLE_SIZES as readonly string[]).includes(value.subtitleSize)) return fail(c, 400, 'VALIDATION_ERROR', 'Choose a supported subtitle size.');
        next.subtitleSize = value.subtitleSize as Preferences['subtitleSize'];
      }
      if ('autoplayNext' in value) {
        if (typeof value.autoplayNext !== 'boolean') return fail(c, 400, 'VALIDATION_ERROR', 'autoplayNext must be a boolean.');
        next.autoplayNext = value.autoplayNext;
      }
      if ('defaultPlaybackSpeed' in value) {
        if (typeof value.defaultPlaybackSpeed !== 'number' || !(SPEEDS as readonly number[]).includes(value.defaultPlaybackSpeed)) return fail(c, 400, 'VALIDATION_ERROR', 'Choose a supported playback speed.');
        next.defaultPlaybackSpeed = value.defaultPlaybackSpeed as Preferences['defaultPlaybackSpeed'];
      }
      if ('historyPaused' in value) {
        if (typeof value.historyPaused !== 'boolean') return fail(c, 400, 'VALIDATION_ERROR', 'historyPaused must be a boolean.');
        next.historyPaused = value.historyPaused;
      }

      await c.env.DB.prepare(
        'INSERT INTO user_preferences (user_id, theme, interface_language, subtitle_language, subtitle_size, autoplay_next, default_playback_speed, history_paused) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme, interface_language = excluded.interface_language, subtitle_language = excluded.subtitle_language, subtitle_size = excluded.subtitle_size, autoplay_next = excluded.autoplay_next, default_playback_speed = excluded.default_playback_speed, history_paused = excluded.history_paused, updated_at = CURRENT_TIMESTAMP',
      ).bind(user.id, next.theme, next.interfaceLanguage, next.subtitleLanguage, next.subtitleSize, next.autoplayNext ? 1 : 0, next.defaultPlaybackSpeed, next.historyPaused ? 1 : 0).run();
      return ok(c, next);
    } catch {
      return fail(c, 503, 'PREFERENCES_UNAVAILABLE', 'Your account preferences could not be saved.');
    }
  });
}
