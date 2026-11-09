import { useSearchParams } from 'react-router-dom';
import { CalendarDays, RotateCcw, X } from 'lucide-react';
import { CardGrid, EmptyState, ErrorState, Pager, SkeletonGrid } from '../components/catalog';
import Select, { type SelectOption } from '../components/Select';
import { useApi } from '../lib/useApi';
import { formatLabel, statusLabel, type CatalogCard, type GenreCount, type ItemList } from '../lib/catalog';
import {
  EMPTY_SEARCH, MAX_YEAR, MIN_YEAR, SEARCH_FORMATS, SEARCH_STATUSES, canSearch, hasFilters, parseSearchState, toApiPath, toUrlParams,
  type SearchState,
} from '../lib/searchState';

const ANY = '' as const;

function yearOptions(): SelectOption<string>[] {
  const newest = Math.min(MAX_YEAR, new Date().getFullYear() + 1);
  const years: SelectOption<string>[] = [{ value: '', label: 'Any year' }];
  for (let y = newest; y >= 1960 && y >= MIN_YEAR; y -= 1) years.push({ value: String(y), label: String(y) });
  return years;
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const state = parseSearchState(params);
  const searching = canSearch(state.q);

  const update = (patch: Partial<SearchState>) => setParams(toUrlParams({ ...state, ...patch, page: patch.page ?? 1 }));
  const reset = () => setParams(toUrlParams({ ...EMPTY_SEARCH, q: state.q }));

  const genres = useApi<ItemList<GenreCount>>('/catalog/genres');
  const results = useApi<ItemList<CatalogCard>>(toApiPath(state));

  const genreOptions: SelectOption<string>[] = [{ value: ANY, label: 'Any genre' }];
  if (genres.status === 'ok') genres.data.items.forEach((g) => genreOptions.push({ value: g.name, label: g.name }));
  if (state.genre && !genreOptions.some((o) => o.value === state.genre)) genreOptions.push({ value: state.genre, label: state.genre });

  const formatOptions: SelectOption<SearchState['format']>[] = [{ value: ANY, label: 'Any format' }, ...SEARCH_FORMATS.map((f) => ({ value: f, label: formatLabel(f) ?? f }))];
  const statusOptions: SelectOption<SearchState['status']>[] = [{ value: ANY, label: 'Any status' }, ...SEARCH_STATUSES.map((s) => ({ value: s, label: statusLabel(s) ?? s }))];
  const sortOptions: SelectOption<SearchState['sort']>[] = [
    { value: ANY, label: searching ? 'Best match' : 'Most popular' },
    ...(searching ? [{ value: 'popularity' as const, label: 'Most popular' }] : []),
    { value: 'latest', label: 'Recently updated' },
    { value: 'rating', label: 'Top rated' },
  ];

  const total = results.status === 'ok' ? results.meta.total ?? results.data.items.length : null;

  return (
    <div className="kc-search-page">
      <header className="kc-page-head">
        <h1>Search</h1>
        <p>Type in the bar above to find a title, or use the filters to browse.</p>
      </header>

      <div className="kc-filter-row" role="group" aria-label="Filters">
        <Select label="Genre" value={state.genre} options={genreOptions} onChange={(genre) => update({ genre })} />
        <Select label="Format" value={state.format} options={formatOptions} onChange={(format) => update({ format })} />
        <Select label="Status" value={state.status} options={statusOptions} onChange={(status) => update({ status })} />
        <Select label="Year" value={state.year === null ? '' : String(state.year)} options={yearOptions()} icon={<CalendarDays size={15} aria-hidden="true" />} onChange={(year) => update({ year: year === '' ? null : Number(year) })} />
        <Select label="Sort" value={state.sort} placeholder={sortOptions[0].label} options={sortOptions} onChange={(sort) => update({ sort })} />
        <button type="button" className="kc-icon-btn" onClick={reset} disabled={!hasFilters(state)} aria-label="Reset filters" title="Reset filters"><RotateCcw size={16} aria-hidden="true" /></button>
      </div>

      {state.q.trim() !== '' && (
        <div className="kc-active-query">
          <span>{searching ? 'Results for' : 'Search text'} <b>“{state.q.trim()}”</b></span>
          <button type="button" aria-label="Clear search text" onClick={() => update({ q: '' })}><X size={14} aria-hidden="true" /></button>
        </div>
      )}
      {state.q.trim() !== '' && !searching && <p className="kc-hint">Type at least 2 characters to search by title. Showing filtered results instead.</p>}

      <div aria-live="polite" className="kc-results">
        {results.status === 'loading' && <SkeletonGrid count={12} />}
        {results.status === 'error' && <ErrorState error={results.error} onRetry={results.reload} />}
        {results.status === 'ok' && (
          results.data.items.length === 0
            ? <EmptyState title="No matches">{searching ? <>Nothing matches “{state.q.trim()}” with these filters.</> : 'Nothing matches these filters.'}</EmptyState>
            : <>
                {total !== null && <p className="kc-count">{total} result{total === 1 ? '' : 's'}</p>}
                <CardGrid items={results.data.items} />
                <Pager page={state.page} hasNextPage={results.meta.hasNextPage === true} total={results.meta.total} onPage={(page) => update({ page })} />
              </>
        )}
      </div>
    </div>
  );
}
