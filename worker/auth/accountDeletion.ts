/** Delete account-owned rows but retain a minimal profile tombstone; no profile FK cascade runs. */
export async function deleteStandardAccount(db: D1Database, accountId: string): Promise<'not-found' | 'deleted'> {
  const target = await db.prepare(
    "SELECT id FROM user_profiles WHERE id = ? AND role = 'user' AND account_status IN ('active', 'suspended')",
  ).bind(accountId).first<{ id: string }>();
  if (!target) return 'not-found';

  const ownedTables: ReadonlyArray<readonly [string, string]> = [
    ['sessions', 'user_id'], ['user_credentials', 'user_id'], ['auth_identities', 'user_id'],
    ['email_verification_tokens', 'user_id'], ['password_reset_tokens', 'user_id'], ['provider_connections', 'user_id'],
    ['google_oauth_states', 'link_user_id'], ['youtube_oauth_states', 'user_id'], ['user_preferences', 'user_id'],
    ['user_library', 'user_id'], ['watch_progress', 'user_id'], ['viewing_history', 'user_id'], ['user_watch_history', 'user_id'],
    ['youtube_feed_channels', 'user_id'], ['youtube_feed_cursors', 'user_id'], ['youtube_watch_history', 'user_id'],
    ['youtube_watch_later', 'user_id'], ['user_anime_library_refs', 'user_id'], ['user_movie_library', 'user_id'], ['user_movie_library_refs', 'user_id'],
    ['user_watch_history_tombstones', 'user_id'], ['user_watch_history_clear_markers', 'user_id'], ['user_media_playback', 'user_id'],
  ];
  const tombstoneGuard = "EXISTS (SELECT 1 FROM user_profiles WHERE id = ? AND account_status = 'deleted')";
  const results = await db.batch([
    db.prepare(`UPDATE user_profiles
      SET display_name = 'Former account', avatar_url = NULL, bio = '', profile_visibility = 'private',
          email = NULL, email_verified_at = NULL, username = NULL, account_status = 'deleted',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND role = 'user' AND account_status IN ('active', 'suspended')`).bind(accountId),
    ...ownedTables.map(([table, column]) =>
      db.prepare(`DELETE FROM ${table} WHERE ${column} = ? AND ${tombstoneGuard}`).bind(accountId, accountId),
    ),
  ]);
  return Number(results[0]?.meta?.changes ?? 0) === 1 ? 'deleted' : 'not-found';
}
