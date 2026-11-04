# Product specification

## 1. Product concept

**Working brand:** KAIRO (replaceable). A premium anime discovery and licensed-playback web application designed around the feeling of entering a curated story universe. Browsing should feel cinematic and immersive; navigation and controls should remain fast, clear, and predictable.

**Primary audience:** People who browse anime catalogues, follow series across seasons, maintain watchlists, and resume episodes across devices.

**Product principles:** discovery first; artwork-led storytelling; fast access to continue watching; user-owned library; clear provider/source status; privacy by default; accessible controls.

## 2. Information architecture

Primary navigation:
- Discover
- Anime
- Movies
- Seasonal
- Genres
- My Library

Secondary navigation / profile menu:
- Continue Watching
- Watchlist
- Favorites
- History
- Profile
- Settings

Routes (suggested):
- `/` — discover home
- `/search?q=` — search and filters
- `/browse/:category` — category/genre/seasonal collections
- `/anime/:slug` — anime details
- `/watch/:episodeId` — player and episode context
- `/library` — personal collections
- `/profile` — profile and statistics
- `/settings` — preferences and account

## 3. Home / Discover

### Header and navigation
- Desktop: narrow left navigation rail with brand mark, primary destinations, a prominent search affordance, and profile controls. The rail may expand on hover/focus but must not cover content.
- Tablet: compact top navigation or collapsible rail.
- Mobile: bottom navigation with 4–5 primary destinations and a separate search entry.
- Header background should be translucent only where contrast remains reliable.

### Hero stage
- Feature one title at a time with a cinematic landscape/backdrop and a transparent character cutout on the right.
- Include eyebrow label (e.g. “FEATURED STORY”), title, short synopsis, genre chips, release details, primary action (“Explore title”), secondary action (“Add to list”), and a small carousel indicator.
- Use a dark gradient behind text and reserve a safe zone around faces.
- Keep hero text readable over any artwork; support fallback gradient when no image is available.

### Content rails
- Continue Watching (only for signed-in users with progress; show progress bar and episode label).
- Trending this week.
- Recently updated.
- New season picks.
- Hidden gems / editor's picks.
- Genre collections.
- Popular movies.

Each rail must handle horizontal scrolling with touch, mouse wheel/trackpad, keyboard buttons, and clear edge affordances. Use poster cards with title, year, content type, optional rating, and optional episode count. Do not show a rating if none is provided.

## 4. Search and browse

- Debounced search with cancellation of stale requests.
- Keyboard-accessible suggestion list.
- Filters: genre, year, format, release status, season, and provider availability where applicable.
- Sort: relevance, popularity, latest update, rating (only when reliable data exists).
- URL reflects query/filter/page state.
- Pagination or infinite scrolling with a visible loading boundary.
- Preserve filters when navigating to a result and returning.
- Include empty, error, retry, and no-more-results states.

## 5. Anime details

- Poster, optional landscape banner, and optional transparent character cutout.
- Title and alternate titles.
- Synopsis with expand/collapse.
- Genre chips, year, season, format, status, studios/creators (where licensed metadata supplies them), episode count, and rating (when supplied).
- Actions: Add to Library, Favorite, Start/Resume.
- Episode list with episode number, title, thumbnail, duration if known, and watched/progress state.
- Related titles and recommended collections.
- Clear unavailable-data states; never fabricate episode counts or scores.

## 6. Watch page

- Large responsive player with an uncluttered control surface.
- Controls: play/pause, seek, volume, mute, fullscreen, playback speed, subtitles, quality (only if provider supplies multiple variants), picture-in-picture where supported, previous/next episode.
- Subtitle track menu with language labels and off option.
- Resume prompt when progress is known.
- Save progress periodically and on pause/end/unload using a debounced, best-effort request.
- Skip intro/outro only if verified timestamps are supplied by a provider or entered by an authorized editor.
- Episode drawer/list and related episodes below the player.
- When no authorized source is available, show a designed unavailable state with a retry button and explanation. Never silently substitute a different provider.

## 7. My Library

Tabs/filters:
- All
- Watching
- Plan to Watch
- Completed
- On Hold
- Dropped
- Favorites

Support sorting by recently updated, title, and date added. Every item should support changing status and removing from a list. Confirm destructive history clearing. Library state must be associated with the authenticated account, not a browser-wide shared identifier.

## 8. User profile and settings

Profile:
- Avatar, display name, join date, favourite genres, watch statistics, and recently watched titles.
- Privacy controls for public/private profile visibility.

Settings:
- Theme selection (Astral Plum, Sakura Ember, Ocean Circuit, Moonlit Jade).
- Interface language.
- Preferred subtitle language and subtitle styling.
- Default playback speed and autoplay preference.
- Privacy and history controls.
- Account/session management through the configured identity provider.

## 9. Interaction design

- Card hover: subtle lift, thumbnail scale, reveal actions; no aggressive zoom.
- Page transitions: restrained fade/slide; obey reduced-motion preference.
- Toasts: short and actionable.
- Skeletons: mirror final content geometry.
- Dialogs: trap focus, Escape closes, return focus to trigger.
- Focus: visible, high-contrast focus ring in every theme.
- Use optimistic changes only when rollback and failure messaging exist.

## 10. Responsive behavior

- Small phones: one- or two-column poster grid depending on width; bottom nav; player controls with large touch targets; horizontal rails.
- Large phones/tablets: 3–5 poster columns; compact hero; collapsible filters.
- Desktop: left rail, wide hero, multi-column grids, expanded detail layout.
- Wide desktop: cap content width and preserve comfortable line lengths; do not stretch poster cards indefinitely.

## 11. Non-functional targets

- Good Core Web Vitals and low layout shift.
- Lazy-load below-the-fold art.
- Avoid giant client bundles; split player and settings routes where appropriate.
- API timeouts, cancellation, retries only for safe idempotent reads.
- Accessible semantic structure and keyboard operation.
- Respect user privacy and provider terms.
