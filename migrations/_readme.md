# migrations/ — folder index

## Purpose

Ordered additive D1 schema history. Never edit a migration already applied to a shared environment.

## Direct files

- [0001_initial_schema.sql](0001_initial_schema.sql) — guide: 0001_initial_schema_readme.md.
- [0002_provider_architecture.sql](0002_provider_architecture.sql) — guide: 0002_provider_architecture_readme.md.
- [0003_accounts.sql](0003_accounts.sql) — guide: 0003_accounts_readme.md.
- [0004_auth_rate_limits.sql](0004_auth_rate_limits.sql) — guide: 0004_auth_rate_limits_readme.md.
- [0005_google_oauth.sql](0005_google_oauth.sql) — guide: 0005_google_oauth_readme.md.
- [0006_watch_history.sql](0006_watch_history.sql) — guide: 0006_watch_history_readme.md.
- [0007_youtube_oauth.sql](0007_youtube_oauth.sql) — guide: 0007_youtube_oauth_readme.md.
- [0008_youtube_feed_channels.sql](0008_youtube_feed_channels.sql) — guide: 0008_youtube_feed_channels_readme.md.
- [0009_youtube_feed_cursors.sql](0009_youtube_feed_cursors.sql) — guide: 0009_youtube_feed_cursors_readme.md.
- [0010_youtube_upload_playlists.sql](0010_youtube_upload_playlists.sql) — guide: 0010_youtube_upload_playlists_readme.md.
- [0011_youtube_media_library.sql](0011_youtube_media_library.sql) — guide: 0011_youtube_media_library_readme.md.
- [0012_movies_catalogue.sql](0012_movies_catalogue.sql) — guide: 0012_movies_catalogue_readme.md.
- [0013_unified_media_sync.sql](0013_unified_media_sync.sql) — guide: 0013_unified_media_sync_readme.md.
- [0014_user_media_playback.sql](0014_user_media_playback.sql) — guide: 0014_user_media_playback_readme.md.
- [0015_closed_access_usernames.sql](0015_closed_access_usernames.sql) — guide: 0015_closed_access_usernames_readme.md.
- [0016_playback_write_order.sql](0016_playback_write_order.sql) — guide: 0016_playback_write_order_readme.md.
- [0017_admin_email_otp_console_rotation.sql](0017_admin_email_otp_console_rotation.sql) — guide: 0017_admin_email_otp_console_rotation_readme.md.
- [0018_cloudflare_access_identity_admin_lockout.sql](0018_cloudflare_access_identity_admin_lockout.sql) — guide: 0018_cloudflare_access_identity_admin_lockout_readme.md.

## Child folders


## Connections and maintenance

The chain contains 18 migrations (0001–0018), applied in numeric order. Deployed migrations are immutable.

Every tracked file in this folder has an adjacent <filename>_readme.md guide.