import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { theme } from '../styles/theme';
import { fetchTvSeasons, fetchEpisodes, getTmdbStillUrl } from '../data/tmdb';
import type { SeasonSummary, Episode } from '../data/tmdb';
import type { CSSProperties } from 'react';

interface EpisodeBrowserProps {
  tvId: number;
  isTv: boolean;
  /** Which zone of the parent detail view has focus. null = somewhere else (e.g., action buttons),
   *  in which case NEITHER season tabs NOR episode rows show a focus ring. */
  focusedZone?: 'seasons' | 'episodes' | null;
  focusedSeason?: number;
  focusedEpisode?: number;
}

export function EpisodeBrowser({ tvId, isTv, focusedZone = null, focusedSeason = 0, focusedEpisode = -1 }: EpisodeBrowserProps) {
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  // Web mode tracks the user's clicked season locally. TV mode derives it
  // from `focusedSeason` so there's NO render where the visible "active" tab
  // is one frame behind the focused tab. (That lag was the bug — for one
  // frame after a LEFT/RIGHT press, both the old and new tab looked
  // highlighted because the active state hadn't caught up yet.)
  const [webActiveSeason, setWebActiveSeason] = useState(0);
  const activeSeason = isTv ? Math.max(0, Math.min(focusedSeason, Math.max(0, seasons.length - 1))) : webActiveSeason;
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const focusedEpisodeRef = useRef<HTMLDivElement>(null);
  const seasonTabsRef = useRef<HTMLDivElement>(null);
  const focusedSeasonTabRef = useRef<HTMLButtonElement>(null);

  // Fetch seasons on mount
  useEffect(() => {
    let cancelled = false;
    fetchTvSeasons(tvId).then((s) => {
      if (!cancelled && s.length > 0) {
        setSeasons(s);
        setWebActiveSeason(0);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [tvId]);

  // Fetch episodes when active season changes
  useEffect(() => {
    if (seasons.length === 0) return;
    const season = seasons[activeSeason];
    if (!season) return;
    let cancelled = false;
    fetchEpisodes(tvId, season.seasonNumber).then((eps) => {
      if (!cancelled) setEpisodes(eps);
    });
    return () => { cancelled = true; };
  }, [tvId, activeSeason, seasons]);

  // Keep the focused row in view as the user navigates. useLayoutEffect runs after
  // DOM updates but before paint, and we use 'instant' (auto) scroll behavior so
  // rapid key repeat doesn't queue up overlapping smooth-scroll animations that
  // make the page feel laggy past the visible fold.
  useLayoutEffect(() => {
    if (!isTv) return;
    if (focusedZone === 'episodes' && focusedEpisodeRef.current) {
      focusedEpisodeRef.current.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    } else if (focusedZone === 'seasons') {
      // Bring the row into view vertically AND scroll the focused tab horizontally
      // within the tab row so it never falls off the right edge for shows with
      // many seasons.
      seasonTabsRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      focusedSeasonTabRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    }
  }, [isTv, focusedZone, focusedEpisode, focusedSeason]);

  const container: CSSProperties = {
    padding: isTv ? '16px 48px 32px' : '16px 32px 24px',
    fontFamily: theme.typography.fontFamily,
    // Fade content in when the API resolves so it hydrates within the
    // already-final-sized panel rather than popping. No layout shift since the
    // parent panel is pinned to its final height.
    animation: 'overlay-item-in 380ms cubic-bezier(0.22, 1, 0.36, 1) both',
  };

  if (loading || seasons.length === 0) return null;

  const seasonTabs: CSSProperties = {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
    overflowX: 'auto',
    scrollbarWidth: 'none',
  };

  return (
    <div style={container}>
      {/* Season tabs */}
      <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 12 }}>Episodes</div>
      <div ref={seasonTabsRef} style={seasonTabs as CSSProperties}>
        {seasons.map((s, i) => {
          const isActive = i === activeSeason;
          // Tabs only show a focus ring when the parent explicitly says the
          // seasons zone has focus — never when zone is 'buttons' or 'episodes'.
          const isFocusedTab = isTv && focusedZone === 'seasons' && i === focusedSeason;
          // Three states with clear visual hierarchy:
          //   focused: bright white border + glow (cursor is here)
          //   active:  subtle bg + bold text (this is the season whose episodes are showing)
          //   neither: muted bg + dim text
          const tabStyle: CSSProperties = {
            padding: '6px 16px',
            borderRadius: 6,
            border: isFocusedTab ? '2px solid #ffffff' : '2px solid transparent',
            background: isActive ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
            boxShadow: isFocusedTab
              ? '0 0 0 1px rgba(255,255,255,0.4), 0 0 16px rgba(255,255,255,0.25)'
              : 'none',
            color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
            fontSize: 13,
            fontWeight: isActive ? 600 : 400,
            cursor: isTv ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            fontFamily: theme.typography.fontFamily,
            outline: 'none',
            // No transition on the focus-indicating properties (border, shadow) so
            // rapid LEFT/RIGHT presses always show the ring at full intensity.
            // Background/color transitions are still subtle (60ms) for a tactile feel.
            transition: 'background 60ms ease-out, color 60ms ease-out',
          };
          return (
            <button
              key={s.seasonNumber}
              ref={isFocusedTab ? focusedSeasonTabRef : null}
              style={tabStyle}
              onClick={() => !isTv && setWebActiveSeason(i)}
            >
              {s.name}
            </button>
          );
        })}
      </div>

      {/* Episode list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {episodes.map((ep, i) => {
          // Clamp the incoming focused index to the current episode range so we always
          // render a valid focus state, even briefly during a season swap.
          const clampedFocus = Math.max(0, Math.min(focusedEpisode, episodes.length - 1));
          // Episode rows only show a focus ring when the parent says the episodes
          // zone has focus — never when zone is 'buttons' or 'seasons'.
          const isFocusedEp = isTv && focusedZone === 'episodes' && i === clampedFocus;
          const epStyle: CSSProperties = {
            display: 'flex',
            gap: 16,
            padding: 12,
            borderRadius: 8,
            position: 'relative',
            background: isFocusedEp ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.04)',
            // 3px white border on focus, same-width transparent border off so there's no layout shift.
            border: isFocusedEp ? '3px solid #ffffff' : '3px solid transparent',
            // Stacked glow: tight inner ring + soft drop shadow. Stays visible against
            // any backdrop, including bright stills behind the page.
            boxShadow: isFocusedEp
              ? '0 0 0 1px rgba(255,255,255,0.4), 0 0 20px rgba(255,255,255,0.25), 0 6px 20px rgba(0,0,0,0.5)'
              : 'none',
            outline: 'none',
            // No transition on focus-indicating properties — rapid DOWN presses
            // need instant visual feedback or the ring looks half-rendered.
            transition: 'background 60ms ease-out',
            cursor: isTv ? 'default' : 'pointer',
          };

          return (
            <div
              key={ep.episodeNumber}
              ref={isFocusedEp ? focusedEpisodeRef : null}
              style={epStyle}
            >
              {/* Episode thumbnail */}
              <div style={{
                width: isTv ? 180 : 140,
                height: isTv ? 100 : 80,
                borderRadius: 4,
                overflow: 'hidden',
                flexShrink: 0,
                background: '#333',
              }}>
                {ep.stillPath && (
                  <img
                    src={getTmdbStillUrl(ep.stillPath)}
                    alt={ep.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    loading="lazy"
                  />
                )}
              </div>
              {/* Episode info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: theme.typography.fontFamily }}>
                    {ep.episodeNumber}. {ep.name}
                  </div>
                  {ep.runtime && (
                    <div style={{ color: theme.colors.textMuted, fontSize: 12, flexShrink: 0, marginLeft: 8, fontFamily: theme.typography.fontFamily }}>
                      {ep.runtime}m
                    </div>
                  )}
                </div>
                <div style={{
                  color: theme.colors.textSecondary,
                  fontSize: 12,
                  lineHeight: 1.4,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  fontFamily: theme.typography.fontFamily,
                }}>
                  {ep.overview}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
