import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, RotateCcw, Search, Star, X } from 'lucide-react';
import { EmptyState, ErrorState, MetaChips, Pager, Poster, SkeletonGrid, StatusDot, animeHref } from '../components/catalog';
import Select, { type SelectOption } from '../components/Select';
import { useApi } from '../lib/useApi';
import { formatLabel, statusLabel, textList, type CatalogCard, type GenreCount, type ItemList } from '../lib/catalog';

const SEASONS = ['winter', 'spring', 'summer', 'fall'] as const;
type Season = (typeof SEASONS)[number];
const FORMATS = ['series', 'movie', 'ova', 'ona', 'special'] as const;
const STATUSES = ['airing', 'finished', 'upcoming', 'hiatus'] as const;
const SORTS = ['popularity', 'trending', 'rating', 'latest'] as const;
type Format = (typeof FORMATS)[number] | '';
type Status = (typeof STATUSES)[number] | '';
type Sort = (typeof SORTS)[number];
const cap = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);
const isOneOf = <T extends string>(value: string, values: readonly T[]): value is T => (values as readonly string[]).includes(value);

/** AniList-inspired seasonal discovery, powered by Kairo's live AniList catalogue endpoint. */
export default function SeasonalPage() {
  const [params, setParams] = useSearchParams();
  const current = currentSeason();
  const rawSeason = (params.get('season') ?? '').toLowerCase();
  const season: Season = isOneOf(rawSeason, SEASONS) ? rawSeason : current.season;
  const rawYear = Number(params.get('year'));
  const year = Number.isInteger(rawYear) && rawYear >= 1960 && rawYear <= 2100 ? rawYear : current.year;
  const rawPage = Number(params.get('page') ?? '1');
  const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 500 ? rawPage : 1;
  const q = (params.get('q') ?? '').slice(0, 100);
  const genre = (params.get('genre') ?? '').slice(0, 40);
  const rawFormat = (params.get('format') ?? '').toLowerCase();
  const format: Format = isOneOf(rawFormat, FORMATS) ? rawFormat : '';
  const rawStatus = (params.get('status') ?? '').toLowerCase();
  const status: Status = isOneOf(rawStatus, STATUSES) ? rawStatus : '';
  const rawSort = (params.get('sort') ?? 'popularity').toLowerCase();
  const sort: Sort = isOneOf(rawSort, SORTS) ? rawSort : 'popularity';
  const [searchText, setSearchText] = useState(q);
  useEffect(() => setSearchText(q), [q]);

  const update = (patch: Partial<{ season: Season; year: number; q: string; genre: string; format: Format; status: Status; sort: Sort; page: number }>) => {
    const next = { season, year, q, genre, format, status, sort, page: 1, ...patch };
    const nextParams = new URLSearchParams({ season: next.season, year: String(next.year) });
    if (next.q.trim()) nextParams.set('q', next.q.trim());
    if (next.genre) nextParams.set('genre', next.genre);
    if (next.format) nextParams.set('format', next.format);
    if (next.status) nextParams.set('status', next.status);
    if (next.sort !== 'popularity') nextParams.set('sort', next.sort);
    if (next.page > 1) nextParams.set('page', String(next.page));
    setParams(nextParams);
    setSearchText(next.q);
  };

  const genres = useApi<ItemList<GenreCount>>('/catalog/genres');
  const query = new URLSearchParams({ season, year: String(year), sort, page: String(page), limit: '24' });
  if (genre) query.set('genre', genre);
  if (format) query.set('format', format);
  if (status) query.set('status', status);
  const searching = q.trim().length >= 2;
  if (searching) query.set('q', q.trim());
  const endpoint = (searching ? '/catalog/search?' : '/catalog/browse?') + query.toString();
  const result = useApi<ItemList<CatalogCard>>(endpoint);

  const years: SelectOption<string>[] = [];
  for (let value = current.year + 1; value >= 1960; value -= 1) years.push({ value: String(value), label: String(value) });
  const genreOptions: SelectOption<string>[] = [{ value: '', label: 'All genres' }];
  if (genres.status === 'ok') genres.data.items.forEach((item) => genreOptions.push({ value: item.name, label: item.name }));
  if (genre && !genreOptions.some((option) => option.value === genre)) genreOptions.push({ value: genre, label: genre });
  const formatOptions: SelectOption<Format>[] = [{ value: '', label: 'All formats' }, ...FORMATS.map((value) => ({ value, label: formatLabel(value) ?? value }))];
  const statusOptions: SelectOption<Status>[] = [{ value: '', label: 'All statuses' }, ...STATUSES.map((value) => ({ value, label: statusLabel(value) ?? value }))];
  const sortOptions: SelectOption<Sort>[] = [
    { value: 'popularity', label: 'Popularity' },
    { value: 'trending', label: 'Trending' },
    { value: 'rating', label: 'Highest rated' },
    { value: 'latest', label: 'Newest first' },
  ];
  const hasFilters = Boolean(q || genre || format || status || sort !== 'popularity');
  const total = result.status === 'ok' ? result.meta.total ?? result.data.items.length : null;

  const clearFilters = () => update({ q: '', genre: '', format: '', status: '', sort: 'popularity' });
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    update({ q: searchText });
  };

  return (
    <div className="kc-seasonal-page">
      <header className="kc-page-head">
        <div>
          <span style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase' }}>Seasonal anime</span>
          <h1 style={{ marginTop: 5 }}>{cap(season)} {year}</h1>
          <p>Explore this season's anime, discover new series and narrow the lineup to your taste.</p>
        </div>
      </header>

      <div className="kc-collections" role="tablist" aria-label="Season">
        {SEASONS.map((value) => (
          <button key={value} type="button" role="tab" aria-selected={value === season} className={value === season ? 'active' : ''} onClick={() => update({ season: value })}>{cap(value)}</button>
        ))}
        <div style={{ width: 130, flex: 'none', marginLeft: 'auto' }}>
          <Select label="Year" value={String(year)} options={years} icon={<CalendarDays size={15} aria-hidden="true" />} onChange={(value) => update({ year: Number(value) })} />
        </div>
      </div>

      <form onSubmit={submitSearch} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0, height: 42, padding: '0 12px', border: '1px solid var(--line-2)', borderRadius: 9, background: 'var(--surface)' }}>
          <Search size={16} color="var(--dim)" aria-hidden="true" />
          <input aria-label="Search this season" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search anime in this season…" maxLength={100} style={{ width: '100%', minWidth: 0, border: 0, outline: 0, background: 'transparent', color: 'var(--text)', font: 'inherit', fontSize: 13 }} />
          {searchText && <button type="button" aria-label="Clear search" onClick={() => { setSearchText(''); update({ q: '' }); }} style={{ display: 'grid', placeItems: 'center', border: 0, background: 'transparent', color: 'var(--muted)' }}><X size={15} /></button>}
        </label>
        <button type="submit" className="kc-btn kc-btn-dark"><Search size={15} aria-hidden="true" /> Search</button>
      </form>

      <div className="kc-filter-row" role="group" aria-label="Seasonal filters" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <Select label="Genre" value={genre} options={genreOptions} onChange={(value) => update({ genre: value })} />
        <Select label="Format" value={format} options={formatOptions} onChange={(value) => update({ format: value })} />
        <Select label="Status" value={status} options={statusOptions} onChange={(value) => update({ status: value })} />
        <Select label="Sort" value={sort} options={sortOptions} onChange={(value) => update({ sort: value })} />
        <button type="button" className="kc-icon-btn" onClick={clearFilters} disabled={!hasFilters} aria-label="Clear filters" title="Clear filters"><RotateCcw size={16} aria-hidden="true" /></button>
      </div>

      <div aria-live="polite" className="kc-results">
        {result.status === 'loading' && <SkeletonGrid count={12} />}
        {result.status === 'error' && <ErrorState error={result.error} onRetry={result.reload} />}
        {result.status === 'ok' && (
          result.data.items.length === 0
            ? <EmptyState title="No seasonal anime found">{searching ? 'No titles match this search and these filters.' : 'No titles were found for this season. Try another season or clear some filters.'}</EmptyState>
            : <>
                {total !== null && <p className="kc-count">{total.toLocaleString()} titles · {cap(season)} {year}</p>}
                <div className="kc-grid">
                  {result.data.items.map((item) => <SeasonalCard key={item.id} item={item} />)}
                </div>
                <Pager page={page} hasNextPage={result.meta.hasNextPage === true} total={result.meta.total} onPage={(nextPage) => update({ page: nextPage })} />
              </>
        )}
      </div>
    </div>
  );
}

function SeasonalCard({ item }: { item: CatalogCard }) {
  const genres = textList(item.genres).slice(0, 3);
  return (
    <article className="kc-card">
      <Link to={animeHref(item)} className="kc-poster" aria-label={'Open ' + item.title}>
        <Poster item={item} />
        {item.rating !== null && <span className="kc-poster-score"><Star size={11} fill="currentColor" aria-hidden="true" />{item.rating}<span className="kc-sr"> rating</span></span>}
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8, color: 'var(--muted)', fontSize: 11 }}>
        <StatusDot status={item.status} />
        <span>{statusLabel(item.status) ?? 'Status unknown'}</span>
        <MetaChips item={item} />
      </div>
      <Link to={animeHref(item)} className="kc-card-title">{item.title}</Link>
      {genres.length > 0 && <p style={{ marginTop: 5, color: 'var(--accent)', fontSize: 11, lineHeight: 1.4 }}>{genres.join(' · ')}</p>}
      {item.synopsis && <p style={{ display: '-webkit-box', overflow: 'hidden', marginTop: 6, color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.5, WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{item.synopsis}</p>}
    </article>
  );
}

function currentSeason(): { season: Season; year: number } {
  const now = new Date();
  const month = now.getUTCMonth();
  const year = now.getUTCFullYear();
  if (month === 11) return { season: 'winter', year: year + 1 };
  if (month <= 1) return { season: 'winter', year };
  if (month <= 4) return { season: 'spring', year };
  if (month <= 7) return { season: 'summer', year };
  return { season: 'fall', year };
}
