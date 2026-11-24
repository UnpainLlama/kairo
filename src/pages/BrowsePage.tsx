import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { CardGrid, EmptyState, ErrorState, Pager, SkeletonGrid } from '../components/catalog';
import { useApi } from '../lib/useApi';
import type { CatalogCard, ItemList } from '../lib/catalog';
import DiscoverPage from './DiscoverPage';
import TrendingPage from './TrendingPage';
import SeasonalPage from './SeasonalPage';
import { NotFoundPage } from './StaticPages';

// Plain list pages. Trending and Discover (/browse/anime) have their own layouts.
const LISTS: Record<string, { title: string; blurb: string; endpoint: string }> = {
  latest: { title: 'Recently updated', blurb: 'Currently airing, newest first.', endpoint: '/catalog/latest' },
};

export default function BrowsePage() {
  const { category } = useParams();
  // The old /browse/movies page queried Anime's "format=movie" catalogue.
  // Keep a component-level fallback as well as the explicit App route so this
  // legacy URL can never silently show Anime records as the TMDB Movies catalogue.
  if (category === 'movies') return <Navigate to="/movies" replace />;
  if (category === 'trending') return <TrendingPage />;
  if (category === 'seasonal') return <SeasonalPage />;
  if (category === 'anime') return <DiscoverPage />;
  const list = category !== undefined && Object.prototype.hasOwnProperty.call(LISTS, category) ? LISTS[category] : null;
  if (!list) return <NotFoundPage />;
  return <ListBrowse title={list.title} blurb={list.blurb} endpoint={list.endpoint} />;
}

function ListBrowse({ title, blurb, endpoint }: { title: string; blurb: string; endpoint: string }) {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get('page') ?? '1');
  const page = Number.isInteger(raw) && raw >= 1 && raw <= 500 ? raw : 1;
  const result = useApi<ItemList<CatalogCard>>(`${endpoint}${endpoint.includes('?') ? '&' : '?'}page=${page}&limit=24`);
  return (
    <>
      <header className="kc-page-head"><h1>{title}</h1><p>{blurb}</p></header>
      <div aria-live="polite">
        {result.status === 'loading' && <SkeletonGrid count={12} />}
        {result.status === 'error' && <ErrorState error={result.error} onRetry={result.reload} />}
        {result.status === 'ok' && (result.data.items.length === 0
          ? <EmptyState title="Nothing here yet">There are no titles for this list right now.</EmptyState>
          : <>
              <CardGrid items={result.data.items} />
              <Pager page={page} hasNextPage={result.meta.hasNextPage === true} total={result.meta.total} onPage={(p) => setParams(p > 1 ? { page: String(p) } : {})} />
            </>)}
      </div>
    </>
  );
}
