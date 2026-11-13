# Kairo UI audit — 13 November 2026

## Scope

Static source audit of the shared application shell and the main Anime and YouTube routes: Home, Discover, Trending, Seasonal, Browse, Search, anime details, episode watch, sign-in/register, profile, history, settings, YouTube Home/Search/Watch, and shared catalogue cards and states.

This review is not a substitute for a manual browser/device pass. The current CI workflow checks TypeScript, tests and production build; it does not run cross-browser visual regression, screen-reader tests, or real-device touch tests.

## Findings fixed in this pass

- Trending and Seasonal used different UTC month cut-offs to infer the current anime season. They now share a tested quarter-based UTC calculation so their default season/year stay in sync.
- Switching directly between anime detail routes could leave the episode list on the previous title's page number. The episode pager now resets to page one when the slug changes.
- The episode Share button silently attempted clipboard access and gave no feedback when clipboard permission/API was unavailable. It now uses native sharing where supported, falls back to clipboard or a copy prompt, and announces the result.
- Home's optional Top airing and Upcoming calls previously failed silently. Each side panel now has its own loading and retry state without blocking the main Home feed.
- Query/filter navigation now returns the viewport to the top as well as pathname changes, avoiding pages opening at a stale scroll offset after changing result sets.
- A late mobile CSS override removed the bottom navigation's surface and backdrop on every route. The override was removed so standard pages keep the legible nav surface and Home retains its intended glass treatment.

## Known limitations and release gates

- /library and /favorites still intentionally display a not-yet-available state; they are not implemented product surfaces yet.
- This pass did not audit the legal/privacy policy text, third-party provider permissions/licensing, YouTube API compliance, authentication hardening, playback-source reliability, or production infrastructure and secrets.
- No production deployment was performed.
- Before a public release, run manual visual checks at narrow mobile, tablet, desktop and ultrawide widths; keyboard-only and screen-reader checks; verify real account flows; review privacy/terms/YouTube disclosures; and complete the operational/security checklist in docs/DEPLOYMENT.md and docs/SECURITY_AND_CONTENT.md.