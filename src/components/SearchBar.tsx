import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Search, X } from 'lucide-react';
import { apiGetWithMeta, isAbort } from '../lib/api';
import { EMPTY_SEARCH, MAX_QUERY, canSearch, parseSearchState, toUrlParams } from '../lib/searchState';
import { formatLabel, type CatalogCard, type ItemList } from '../lib/catalog';
import { Poster, animeHref } from './catalog';

type MediaMode = 'anime' | 'movie';
type Result = { q: string; mode: MediaMode; status: 'ok'; items: CatalogCard[]; total?: number } | { q: string; mode: MediaMode; status: 'error' };

/**
 * Header search. It queries /catalog/search as you type and lists matches in a dropdown, so you can open a title
 * without leaving the page. Enter opens the highlighted title, or the full results page when nothing is highlighted.
 */
export default function SearchBar({ mode = 'anime' }: { mode?: 'anime' | 'youtube' }) {
  const isYouTube = mode === 'youtube';
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState<Result | null>(null);
  const query = text.trim();
  const mediaMode: MediaMode = location.pathname === '/browse/movies'
    || (location.pathname === '/search' && new URLSearchParams(location.search).get('format') === 'movie')
    ? 'movie'
    : 'anime';
  const mediaLabel = isYouTube ? 'YouTube videos' : mediaMode === 'movie' ? 'movies' : 'anime';

  // Mirror the URL: on the search page show its query, everywhere else start empty.
  useEffect(() => {
    const onSearchPage = location.pathname === (isYouTube ? '/youtube/search' : '/search');
    setText(onSearchPage ? (new URLSearchParams(location.search).get('q') ?? '').slice(0, MAX_QUERY) : '');
    setOpen(false);
    setActive(-1);
  }, [isYouTube, location.pathname, location.search]);

  // Debounced lookup. Older requests are aborted, and a result is only shown for the query it was fetched for.
  useEffect(() => {
    if (isYouTube || !canSearch(query) || !open || location.pathname === '/search') return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query, limit: '8', sort: 'relevance' });
      if (mediaMode === 'movie') params.set('format', 'movie');
      apiGetWithMeta<ItemList<CatalogCard>>(`/catalog/search?${params.toString()}`, controller.signal)
        .then(({ data, meta }) => setResult({ q: query, mode: mediaMode, status: 'ok', items: data.items, total: meta.total }))
        .catch((error: unknown) => { if (!isAbort(error)) setResult({ q: query, mode: mediaMode, status: 'error' }); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [isYouTube, query, mediaMode, open, location.pathname]);

  // Ctrl/Cmd+K, or "/" outside a text field, focuses the bar. Clicking elsewhere closes the dropdown.
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

  const resultsHref = (): string => {
    if (isYouTube) return `/youtube/search?q=${encodeURIComponent(query)}`;
    const base = location.pathname === '/search' ? parseSearchState(new URLSearchParams(location.search)) : EMPTY_SEARCH;
    const format = mediaMode === 'movie' ? 'movie' : (base.format === 'movie' ? '' : base.format);
    const qs = toUrlParams({ ...base, q: query, format, page: 1 }).toString();
    return `/search${qs ? `?${qs}` : ''}`;
  };

  const go = (path: string) => {
    setOpen(false);
    inputRef.current?.blur();
    navigate(path);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (items.length ? (i + 1) % items.length : -1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (items.length ? (i <= 0 ? items.length - 1 : i - 1) : -1));
    } else if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (isYouTube) {
        if (searching) go(resultsHref());
      } else {
        const item = items[active];
        if (item) go(animeHref(item));
        else if (searching) go(resultsHref());
      }
    }
  };

  const showPanel = !isYouTube && open && searching;

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
          maxLength={MAX_QUERY}
          placeholder={`Search ${mediaLabel}...`}
          value={text}
          onChange={(event) => { setText(event.target.value); setActive(-1); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {text && <button type="button" className="kc-top-clear" aria-label="Clear search" onClick={() => { setText(''); setActive(-1); inputRef.current?.focus(); }}><X size={15} aria-hidden="true" /></button>}
        <button type="button" className="kc-top-go" aria-label="Search" onClick={() => { if (searching) go(resultsHref()); else inputRef.current?.focus(); }}><Search size={16} aria-hidden="true" /></button>
      </div>

      {showPanel && (
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
