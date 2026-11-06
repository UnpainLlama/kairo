import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { CardGrid, EmptyState, ErrorState, LoadingState, Pager } from '../components/catalog';
import { useApi } from '../lib/useApi';
import type { CatalogCard, GenreCount, ItemList } from '../lib/catalog';
import { formatLabel } from '../lib/catalog';
import { MAX_QUERY, MIN_QUERY, SEARCH_FORMATS, SEARCH_SORTS, canSearch, parseSearchState, toApiPath, toUrlParams, type SearchState } from '../lib/searchState';

const SORT_LABELS: Record<SearchState['sort'], string> = { relevance: 'Relevance', popularity: 'Popularity', latest: 'Recently updated', rating: 'Rating' };

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const state = parseSearchState(params);
  const [text, setText] = useState(state.q);
  const pushed = useRef(state.q);

  // Pick up q changes made elsewhere (header search, back/forward) without fighting the user's typing.
  useEffect(() => {
    if (state.q !== pushed.current) { pushed.current = state.q; setText(state.q); }
  }, [state.q]);

  // 400ms debounce from the text box into the URL.
  useEffect(() => {
    if (text === state.q) return;
    const timer = window.setTimeout(() => {
      pushed.current = text;
      setParams(toUrlParams({ ...state, q: text, page: 1 }), { replace: true });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [text, state, setParams]);

  const update = (patch: Partial<SearchState>) => setParams(toUrlParams({ ...state, ...patch, page: patch.page ?? 1 }));

  const genres = useApi<ItemList<GenreCount>>('/catalog/genres');
  const path = toApiPath(state);
  const results = useApi<ItemList<CatalogCard>>(path);
  const shortQuery = !canSearch(text);

  return (
    <>
      <header className="kc-page-head"><span className="kc-eyebrow">SEARCH</span><h1>Search the catalogue</h1></header>

      <form className="kc-search" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="kc-search-box" htmlFor="search-input">
          <Search size={18} aria-hidden="true" />
          <span className="kc-sr">Search titles</span>
          <input id="search-input" type="search" autoFocus autoComplete="off" maxLength={MAX_QUERY} placeholder="Search by title" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="kc-filters">
          <label>Genre
            <select value={state.genre} onChange={(e) => update({ genre: e.target.value })}>
              <option value="">Any genre</option>
              {state.genre && !(genres.status === 'ok' && genres.data.items.some((g) => g.name === state.genre)) && <option value={state.genre}>{state.genre}</option>}
              {genres.status === 'ok' && genres.data.items.map((g) => <option key={g.name} value={g.name}>{g.name} ({g.count})</option>)}
            </select>
          </label>
          <label>Format
            <select value={state.format} onChange={(e) => update({ format: e.target.value as SearchState['format'] })}>
              <option value="">Any format</option>
              {SEARCH_FORMATS.map((f) => <option key={f} value={f}>{formatLabel(f)}</option>)}
            </select>
          </label>
          <label>Sort by
            <select value={state.sort} onChange={(e) => update({ sort: e.target.value as SearchState['sort'] })}>
              {SEARCH_SORTS.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
            </select>
          </label>
        </div>
      </form>

      <div aria-live="polite" className="kc-results">
        {shortQuery && <EmptyState title="Type at least 2 characters">Search matches titles and alternative titles. The API needs a title to search, so genre and format filters narrow a title search rather than listing everything.</EmptyState>}
        {!shortQuery && results.status === 'loading' && <LoadingState label="Searching" />}
        {!shortQuery && results.status === 'error' && <ErrorState error={results.error} onRetry={results.reload} />}
        {!shortQuery && results.status === 'ok' && (
          results.data.items.length === 0
            ? <EmptyState title="No matches">Nothing in the catalogue matches “{state.q.trim()}” with these filters.</EmptyState>
            : <>
                <p className="kc-count">{results.meta.total ?? results.data.items.length} result{(results.meta.total ?? results.data.items.length) === 1 ? '' : 's'}</p>
                <CardGrid items={results.data.items} />
                <Pager page={state.page} hasNextPage={results.meta.hasNextPage === true} total={results.meta.total} onPage={(page) => update({ page })} />
              </>
        )}
      </div>
      <p className="kc-hint">Minimum {MIN_QUERY} characters.</p>
    </>
  );
}
