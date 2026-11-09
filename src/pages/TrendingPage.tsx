import { useSearchParams } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { EmptyState, ErrorState, Pager, SkeletonGrid, WideCard } from '../components/catalog';
import Select, { type SelectOption } from '../components/Select';
import { useApi } from '../lib/useApi';
import type { CatalogCard, ItemList } from '../lib/catalog';

const SEASONS = ['winter', 'spring', 'summer', 'fall'] as const;
type Season = (typeof SEASONS)[number];
const isSeason = (v: string | null): v is Season => v !== null && (SEASONS as readonly string[]).includes(v);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function thisSeason(): { season: Season; year: number } {
  const now = new Date();
  const m = now.getMonth();
  return { season: m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'fall', year: now.getFullYear() };
}

/** Trending by season: pick a season and year, titles come back most popular first. */
export default function TrendingPage() {
  const [params, setParams] = useSearchParams();
  const now = thisSeason();
  const rawSeason = (params.get('season') ?? '').toLowerCase();
  const season: Season = isSeason(rawSeason) ? rawSeason : now.season;
  const rawYear = Number(params.get('year'));
  const year = Number.isInteger(rawYear) && rawYear >= 1960 && rawYear <= 2100 ? rawYear : now.year;
  const rawPage = Number(params.get('page') ?? '1');
  const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 500 ? rawPage : 1;

  const go = (next: { season?: Season; year?: number; page?: number }) => {
    const p = new URLSearchParams({ season: next.season ?? season, year: String(next.year ?? year) });
    if ((next.page ?? 1) > 1) p.set('page', String(next.page));
    setParams(p);
  };

  const result = useApi<ItemList<CatalogCard>>(`/catalog/browse?season=${season}&year=${year}&sort=popularity&page=${page}&limit=24`);
  const years: SelectOption<string>[] = [];
  for (let y = now.year + 1; y >= 1990; y -= 1) years.push({ value: String(y), label: String(y) });

  return (
    <>
      <header className="kc-page-head kc-trending-head">
        <div><h1>Trending</h1><p>{cap(season)} {year} · Trending</p></div>
        <div className="kc-seasons" role="tablist" aria-label="Season">
          {SEASONS.map((s) => <button key={s} type="button" role="tab" aria-selected={s === season} className={s === season ? 'active' : ''} onClick={() => go({ season: s })}>{s}</button>)}
        </div>
        <Select label="Year" value={String(year)} options={years} icon={<CalendarDays size={15} aria-hidden="true" />} onChange={(y) => go({ year: Number(y) })} />
      </header>

      <div aria-live="polite">
        {result.status === 'loading' && <SkeletonGrid count={9} />}
        {result.status === 'error' && <ErrorState error={result.error} onRetry={result.reload} />}
        {result.status === 'ok' && (result.data.items.length === 0
          ? <EmptyState title="Nothing for this season">No titles were found for {cap(season)} {year}. Try another season or year.</EmptyState>
          : <>
              <div className="kc-wide-grid">{result.data.items.map((item) => <WideCard key={item.id} item={item} />)}</div>
              <Pager page={page} hasNextPage={result.meta.hasNextPage === true} total={result.meta.total} onPage={(p) => go({ page: p })} />
            </>)}
      </div>
    </>
  );
}
