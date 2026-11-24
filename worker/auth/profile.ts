import { clearSessionCookie } from './session';
import { getRequestUser } from './requestUser';
import { verifyPassword } from './password';

function ok(c: any, data: unknown, status = 200) {
  return c.json({ success: true, data, meta: { requestId: c.get('requestId') } }, status);
}

function fail(c: any, status: number, code: string, message: string) {
  return c.json({ success: false, error: { code, message }, meta: { requestId: c.get('requestId') } }, status);
}

function originAllowed(c: any): boolean {
  const origin = c.req.header('Origin');
  return !origin || origin === new URL(c.req.url).origin;
}

export function registerProfileRoutes(app: any) {
  app.get('/api/v1/me/profile', async (c: any) => {
    const user = await getRequestUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to read the profile.');
    try {
      const profile = await c.env.DB.prepare(
        'SELECT id, username, display_name AS displayName, email, avatar_url AS avatarUrl, bio, profile_visibility AS visibility, created_at AS createdAt, updated_at AS updatedAt FROM user_profiles WHERE id = ? LIMIT 1',
      ).bind(user.id).first();
      if (!profile) return fail(c, 404, 'PROFILE_NOT_FOUND', 'The account profile could not be found.');
      return ok(c, { profile });
    } catch {
      return fail(c, 503, 'PROFILE_UNAVAILABLE', 'Your profile is temporarily unavailable.');
    }
  });

  app.put('/api/v1/me/profile', async (c: any) => {
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const user = await getRequestUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to update the profile.');
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(c, 400, 'VALIDATION_ERROR', 'Provide valid profile details.');
    const value = body as Record<string, unknown>;
    const displayName = typeof value.displayName === 'string' ? value.displayName.trim() : '';
    const bio = typeof value.bio === 'string' ? value.bio.trim() : '';
    const visibility = value.visibility;
    if (displayName.length < 2 || displayName.length > 40 || /[\u0000-\u001f]/.test(displayName)) {
      return fail(c, 400, 'VALIDATION_ERROR', 'Display name must be 2–40 characters and contain no control characters.');
    }
    if (bio.length > 280 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(bio)) {
      return fail(c, 400, 'VALIDATION_ERROR', 'Bio must be 280 characters or fewer and contain no control characters.');
    }
    if (visibility !== 'private' && visibility !== 'public') return fail(c, 400, 'VALIDATION_ERROR', 'Profile visibility must be private or public.');
    try {
      await c.env.DB.prepare(
        'UPDATE user_profiles SET display_name = ?, bio = ?, profile_visibility = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ).bind(displayName, bio, visibility, user.id).run();
      return ok(c, { updated: true, displayName, bio, visibility });
    } catch {
      return fail(c, 503, 'PROFILE_UNAVAILABLE', 'Your profile could not be saved.');
    }
  });

  app.get('/api/v1/me/export', async (c: any) => {
    const user = await getRequestUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to export account data.');
    c.header('Cache-Control', 'no-store');
    try {
      const [profile, preferences, animeLibrary, moviesLibrary, history, playback] = await Promise.all([
        c.env.DB.prepare('SELECT id, username, display_name AS displayName, email, avatar_url AS avatarUrl, bio, profile_visibility AS visibility, created_at AS createdAt FROM user_profiles WHERE id = ?').bind(user.id).first(),
        c.env.DB.prepare('SELECT theme, interface_language AS interfaceLanguage, subtitle_language AS subtitleLanguage, subtitle_size AS subtitleSize, autoplay_next AS autoplayNext, default_playback_speed AS defaultPlaybackSpeed, history_paused AS historyPaused FROM user_preferences WHERE user_id = ?').bind(user.id).first(),
        c.env.DB.prepare('SELECT anime_id AS animeId, status, is_favorite AS isFavorite, added_at AS addedAt, updated_at AS updatedAt FROM user_library WHERE user_id = ? ORDER BY updated_at DESC').bind(user.id).all(),
        c.env.DB.prepare('SELECT provider_id AS providerId, external_id AS externalId, status, is_favorite AS isFavorite, rating, added_at AS addedAt, updated_at AS updatedAt FROM user_movie_library_refs WHERE user_id = ? ORDER BY updated_at DESC').bind(user.id).all(),
        c.env.DB.prepare('SELECT anime_slug AS slug, title, poster_url AS posterUrl, episode_number AS episodeNumber, episode_title AS episodeTitle, duration_seconds AS durationSeconds, progress_seconds AS progressSeconds, updated_at AS updatedAt FROM user_watch_history WHERE user_id = ? ORDER BY updated_at DESC').bind(user.id).all(),
        c.env.DB.prepare('SELECT media_type AS mediaType, media_key AS mediaKey, title, artwork_url AS artworkUrl, duration_seconds AS durationSeconds, progress_seconds AS progressSeconds, completed, player_state_json AS playerStateJson, updated_at AS updatedAt FROM user_media_playback WHERE user_id = ? AND media_type <> \'youtube\' ORDER BY updated_at DESC').bind(user.id).all(),
      ]);
      const playbackItems = (playback.results ?? []).map((row: Record<string, unknown>) => {
        let playerState: unknown = {};
        try { playerState = JSON.parse(String(row.playerStateJson ?? '{}')); } catch { playerState = {}; }
        return { ...row, completed: Number(row.completed) === 1, playerState, playerStateJson: undefined };
      });
      return ok(c, {
        exportedAt: new Date().toISOString(),
        profile,
        preferences,
        animeLibrary: animeLibrary.results ?? [],
        moviesLibrary: moviesLibrary.results ?? [],
        watchHistory: history.results ?? [],
        playback: playbackItems,
      });
    } catch {
      return fail(c, 503, 'EXPORT_UNAVAILABLE', 'Your account data could not be exported right now.');
    }
  });

  app.delete('/api/v1/me/account', async (c: any) => {
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const user = await getRequestUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to delete the account.');
    if (user.role === 'admin') return fail(c, 403, 'ADMIN_ACCOUNT_PROTECTED', 'The administrator account cannot be self-deleted. Use the reviewed administrator recovery procedure.');
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(c, 400, 'VALIDATION_ERROR', 'Confirm your account deletion with your current password and username.');
    const value = body as Record<string, unknown>;
    const currentPassword = typeof value.currentPassword === 'string' ? value.currentPassword : '';
    const confirmUsername = typeof value.confirmUsername === 'string' ? value.confirmUsername.trim() : '';
    if (!currentPassword || confirmUsername.toLocaleLowerCase('en-US') !== user.username.toLocaleLowerCase('en-US')) {
      return fail(c, 400, 'CONFIRMATION_REQUIRED', 'Enter your current password and username to confirm account deletion.');
    }
    try {
      const credential = await c.env.DB.prepare('SELECT password_hash AS passwordHash FROM user_credentials WHERE user_id = ? LIMIT 1')
        .bind(user.id).first<{ passwordHash: string }>();
      if (!credential || !await verifyPassword(currentPassword, credential.passwordHash)) {
        return fail(c, 403, 'CURRENT_PASSWORD_INCORRECT', 'The current password is incorrect.');
      }
      const deleted = await c.env.DB.prepare('DELETE FROM user_profiles WHERE id = ? AND role = \'user\'').bind(user.id).run();
      if (Number(deleted.meta.changes ?? 0) !== 1) return fail(c, 409, 'ACCOUNT_DELETE_CONFLICT', 'The account could not be deleted. Refresh and try again.');
      c.header('Set-Cookie', clearSessionCookie(new URL(c.req.url).protocol === 'https:'));
      c.header('Cache-Control', 'no-store');
      return ok(c, { deleted: true, accountDataDeleted: true, sessionsRevoked: true });
    } catch {
      return fail(c, 503, 'ACCOUNT_DELETE_UNAVAILABLE', 'The account could not be deleted right now.');
    }
  });
}
