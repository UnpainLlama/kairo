import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, History, Search, X } from 'lucide-react';
import { apiGetWithMeta, isAbort } from '../lib/api';
import { EMPTY_SEARCH, MAX_QUERY, canSearch, parseSearchState, toUrlParams } from '../lib/searchState';
import { buildYouTubeSearchSuggestions, normalizeRecentYouTubeSearches, YOUTUBE_RECENT_SEARCHES_KEY } from '../lib/youtubeSearchSuggestions';
import { formatLabel, type CatalogCard, type ItemList } from '../lib/catalog';
import { Poster, animeHref } from './catalog';
import type { MoviePage, MovieSummary } from '../lib/movies';

type MediaMode = 'anime' | 'movie';
type MovieSuggestionState = { q: string; status: 'ok'; items: MovieSummary[]; total: number } | { q: string; status: 'error' };
type Result = { q: string; mode: MediaMode; status: 'ok'; items: CatalogCard[]; total?: number } | { q: string; mode: MediaMode; status: 'error' };

/**
 * Persistent header search. Anime suggestions use the catalogue API; YouTube suggestions use
 * local recent searches and safe, curated query completions so typing does not spend Data API quota.
 * Enter or the search button always opens the dedicated results route.
 */
export default function SearchBar({ mode = 'anime' }: { mode?: 'anime' | 'youtube' | 'movies' }) {
  const isYouTube = mode === 'youtube';
  const isMovies = mode === 'movies';
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState<Result | null>(null);
  const [movieResult, setMovieResult] = useState<MovieSuggestionState | null>(null);
  const [recentYouTubeQueries, setRecentYouTubeQueries] = useState<string[]>([]);
  const query = text.trim();
  const mediaMode: MediaMode = location.pathname === '/search'
    && new URLSearchParams(location.search).get('format') === 'movie'
    ? 'movie'
    : 'anime';
  const mediaLabel = isYouTube ? 'YouTube videos' : isMovies || mediaMode === 'movie' ? 'movies' : 'anime';
  const maxLength = isYouTube ? 80 : isMovies ? 120 : MAX_QUERY;

  const youtubeSuggestions = useMemo(
    () => buildYouTubeSearchSuggestions(query, recentYouTubeQueries),
    [query, recentYouTubeQueries],
  );

  useEffect(() => {
    const onSearchPage = isYouTube ? location.pathname === '/youtube/search' : isMovies ? location.pathname === '/movies/search' : location.pathname === '/search';
    setText(onSearchPage ? (new URLSearchParams(location.search).get('q') ?? '').slice(0, maxLength) : '');
    setOpen(false);
    setActive(-1);
  }, [isYouTube, isMovies, location.pathname, location.search, maxLength]);

  useEffect(() => {
    if (!isYouTube) return;
    try {
      const saved = normalizeRecentYouTubeSearches(JSON.parse(localStorage.getItem(YOUTUBE_RECENT_SEARCHES_KEY) ?? '[]'));
      setRecentYouTubeQueries(saved);
    } catch {
      setRecentYouTubeQueries([]);
    }
  }, [isYouTube]);

  // Debounced anime lookup. YouTube query completions remain local and do not consume API quota.
  useEffect(() => {
    if (isYouTube || isMovies || !canSearch(query) || !open || location.pathname === '/search') return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query, limit: '8', sort: 'relevance' });
      if (mediaMode === 'movie') params.set('format', 'movie');
      apiGetWithMeta<ItemList<CatalogCard>>(`/catalog/search?${params.toString()}`, controller.signal)
        .then(({ data, meta }) => setResult({ q: query, mode: mediaMode, status: 'ok', items: data.items, total: meta.total }))
        .catch((error: unknown) => { if (!isAbort(error)) setResult({ q: query, mode: mediaMode, status: 'error' }); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [isYouTube, isMovies, query, mediaMode, open, location.pathname]);

  // Movie suggestions use the independent Movies catalogue API, never the Anime catalogue.
  useEffect(() => {
    if (!isMovies || !canSearch(query) || !open || location.pathname === '/movies/search') {
      setMovieResult(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query, page: '1' });
      apiGetWithMeta<MoviePage>('/movies/search?' + params.toString(), controller.signal)
        .then(({ data, meta }) => setMovieResult({ q: query, status: 'ok', items: data.items, total: meta.total ?? data.totalResults }))
        .catch((error: unknown) => {
          if (!isAbort(error)) setMovieResult({ q: query, status: 'error' });
        });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [isMovies, query, open, location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') || (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey)) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    const onDown = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, []);

  const searching = canSearch(query);
  const current = searching && result?.q === query && result.mode === mediaMode ? result : null;
  const items = current?.status === 'ok' ? current.items : [];
  const showPanel = open && searching;

  const resultsHref = (term = query): string => {
    const clean = term.trim().slice(0, maxLength);
    if (isYouTube) return `/youtube/search?q=${encodeURIComponent(clean)}`;
    if (isMovies) return `/movies/search?q=${encodeURIComponent(clean)}`;
    const base = location.pathname === '/search' ? parseSearchState(new URLSearchParams(location.search)) : EMPTY_SEARCH;
    const format = mediaMode === 'movie' ? 'movie' : (base.format === 'movie' ? '' : base.format);
    const qs = toUrlParams({ ...base, q: clean, format, page: 1 }).toString();
    return `/search${qs ? `?${qs}` : ''}`;
  };

  const go = (path: string) => {
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
    navigate(path);
  };

  const submitYouTubeSearch = (term: string) => {
    const clean = term.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (clean.length < 2) {
      inputRef.current?.focus();
      return;
    }
    const next = normalizeRecentYouTubeSearches([clean, ...recentYouTubeQueries.filter(item => item.toLowerCase() !== clean.toLowerCase())]);
    setRecentYouTubeQueries(next);
    try {
      localStorage.setItem(YOUTUBE_RECENT_SEARCHES_KEY, JSON.stringify(next));
    } catch {
      // Search still works when browser storage is unavailable.
    }
    go(resultsHref(clean));
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      const count = isYouTube ? youtubeSuggestions.length : isMovies ? (movieResult?.q === query && movieResult.status === 'ok' ? movieResult.items.length : 0) : items.length;
      setActive(index => count ? (index + 1) % count : -1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const count = isYouTube ? youtubeSuggestions.length : isMovies ? (movieResult?.q === query && movieResult.status === 'ok' ? movieResult.items.length : 0) : items.length;
      setActive(index => count ? (index <= 0 ? count - 1 : index - 1) : -1);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
      inputRef.current?.blur();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (isYouTube) {
        submitYouTubeSearch(active >= 0 ? (youtubeSuggestions[active] ?? query) : query);
      } else if (isMovies) {
        const movieItems = movieResult?.q === query && movieResult.status === 'ok' ? movieResult.items : [];
        const movie = movieItems[active];
        if (movie) go('/movies/' + encodeURIComponent(movie.externalId));
        else if (searching) go(resultsHref());
      } else {
        const item = items[active];
        if (item) go(animeHref(item));
        else if (searching) go(resultsHref());
      }
    }
  };

  const showAnimePanel = !isYouTube && !isMovies && showPanel;
  const showYouTubePanel = isYouTube && showPanel;
  const showMoviePanel = isMovies && showPanel;
  const movieItems = movieResult?.q === query && movieResult.status === 'ok' ? movieResult.items : [];

  return (
    <div className="kc-search-wrap" ref={rootRef} role="search">
      <div className={`kc-top-search${open ? ' focused' : ''}`}>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={`Search ${mediaLabel}`}
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          maxLength={maxLength}
          placeholder={`Search ${mediaLabel}...`}
          value={text}
          onChange={event => { setText(event.target.value); setActive(-1); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {text && <button type="button" className="kc-top-clear" aria-label="Clear search" onClick={() => { setText(''); setActive(-1); inputRef.current?.focus(); }}><X size={15} aria-hidden="true" /></button>}
        <button type="button" className="kc-top-go" aria-label="Search" onClick={() => { if (isYouTube) submitYouTubeSearch(query); else if (searching) go(resultsHref()); else inputRef.current?.focus(); }}><Search size={16} aria-hidden="true" /></button>
      </div>

      {showYouTubePanel && (
        <div className="kc-suggest kc-yt-suggest" id={listId} role="listbox" aria-label="YouTube search suggestions">
          <div className="kc-yt-suggest-heading">Suggestions</div>
          {youtubeSuggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              type="button"
              role="option"
              id={`${listId}-${index}`}
              aria-selected={index === active}
              className={`kc-yt-suggest-row${index === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => submitYouTubeSearch(suggestion)}
            >
              {recentYouTubeQueries.some(item => item.toLowerCase() === suggestion.toLowerCase())
                ? <History size={16} aria-hidden="true" />
                : <Search size={16} aria-hidden="true" />}
              <span>{suggestion}</span>
            </button>
          ))}
          <button type="button" className="kc-yt-suggest-exact" onClick={() => submitYouTubeSearch(query)}>
            <Search size={15} aria-hidden="true" />
            <span>Search for <b>{query}</b></span>
          </button>
        </div>
      )}

      {showMoviePanel && (
        <div className="kc-suggest kc-movie-suggest" id={listId} role="listbox" aria-label="Movie search suggestions">
          {!movieResult || movieResult.q !== query ? <p className="kc-suggest-note" role="status">Searching movies…</p> : null}
          {movieResult?.q === query && movieResult.status === 'error' && <p className="kc-suggest-note" role="alert">Movie search is unavailable right now.</p>}
          {movieResult?.q === query && movieResult.status === 'ok' && movieItems.length === 0 && <p className="kc-suggest-note" role="status">No movies found for “{query}”.</p>}
          {movieItems.map((movie, index) => (
            <Link
              key={movie.providerId + ':' + movie.externalId}
              id={listId + '-' + index}
              role="option"
              aria-selected={index === active}
              className={'kc-suggest-row' + (index === active ? ' active' : '')}
              to={'/movies/' + encodeURIComponent(movie.externalId)}
              onMouseEnter={() => setActive(index)}
              onClick={() => { setOpen(false); inputRef.current?.blur(); }}
            >
              <span className="kc-suggest-poster">
                {movie.posterUrl ? <img src={movie.posterUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span />}
              </span>
              <span className="kc-suggest-copy">
                <b>{movie.title}</b>
                <small>{[movie.releaseYear, movie.originalLanguage?.toUpperCase()].filter(Boolean).join(' · ') || 'Feature film'}</small>
              </span>
            </Link>
          ))}
          {movieResult?.q === query && movieResult.status === 'ok' && movieItems.length > 0 && (
            <Link className="kc-suggest-all" to={resultsHref()} onClick={() => setOpen(false)}>
              See all movie results ({movieResult.total}) <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      )}

      {showAnimePanel && (
        <div className="kc-suggest" id={listId} role="listbox" aria-label="Search results">
          {!current && <p className="kc-suggest-note" role="status">Searching…</p>}
          {current?.status === 'error' && <p className="kc-suggest-note" role="alert">Search is unavailable right now.</p>}
          {current?.status === 'ok' && items.length === 0 && <p className="kc-suggest-note" role="status">No {mediaLabel} found for “{query}”.</p>}
          {items.map((item, index) => (
            <Link
              key={item.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={`kc-suggest-row${index === active ? ' active' : ''}`}
              to={animeHref(item)}
              onMouseEnter={() => setActive(index)}
              onClick={() => { setOpen(false); inputRef.current?.blur(); }}
            >
              <span className="kc-suggest-poster"><Poster item={item} /></span>
              <span className="kc-suggest-copy">
                <b>{item.title}</b>
                <small>{[formatLabel(item.format), item.releaseYear, item.episodeCount ? `${item.episodeCount} ep` : null].filter(Boolean).join(' · ') || 'Anime'}</small>
              </span>
            </Link>
          ))}
          {current?.status === 'ok' && items.length > 0 && (
            <Link className="kc-suggest-all" to={resultsHref()} onClick={() => setOpen(false)}>
              See all {mediaLabel} results{typeof current.total === 'number' ? ` (${current.total})` : ''} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
