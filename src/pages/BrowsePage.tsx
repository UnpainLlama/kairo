import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CardGrid, EmptyState, ErrorState, LoadingState, Pager } from '../components/catalog';
import { useApi } from '../lib/useApi';
import type { CatalogCard, ItemList } from '../lib/catalog';
import { NotFoundPage } from './StaticPages';

const CATEGORIES = {
  trending: { title: 'Trending', blurb: 'Ranked by stored popularity score.', endpoint: '/catalog/trending' },
  latest: { title: 'Recently updated', blurb: 'Ordered by when each catalogue entry last changed.', endpoint: '/catalog/latest' },
  anime: { title: 'Anime', blurb: 'All series.', endpoint: null },
  movies: { title: 'Movies', blurb: 'Feature films.', endpoint: null },
  seasonal: { title: 'Seasonal', blurb: 'Titles by season.', endpoint: null },
} as const;
type Category = keyof typeof CATEGORIES;
const isCategory = (v: string | undefined): v is Category => v !== undefined && v in CATEGORIES;

export function BrowseIndex() {
  return (
    <>
      <header className="kc-page-head"><span className="kc-eyebrow">BROWSE</span><h1>Browse</h1></header>
      <ul className="kc-linklist">
        {(Object.keys(CATEGORIES) as Category[]).map((key) => (
          <li key={key}><Link to={`/browse/${key}`}><b>{CATEGORIES[key].title}</b><span>{CATEGORIES[key].blurb}</span></Link></li>
        ))}
      </ul>
    </>
  );
}

export default function BrowsePage() {
  const { category } = useParams();
  if (!isCategory(category)) return <NotFoundPage />;
  const config = CATEGORIES[category];
  return config.endpoint ? <ListBrowse title={config.title} blurb={config.blurb} endpoint={config.endpoint} /> : <UnavailableBrowse title={config.title} />;
}

function ListBrowse({ title, blurb, endpoint }: { title: string; blurb: string; endpoint: string }) {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get('page') ?? '1');
  const page = Number.isInteger(raw) && raw >= 1 && raw <= 500 ? raw : 1;
  const result = useApi<ItemList<CatalogCard>>(`${endpoint}?page=${page}&limit=24`);
  return (
    <>
      <header className="kc-page-head"><span className="kc-eyebrow">BROWSE</span><h1>{title}</h1><p>{blurb}</p></header>
      <div aria-live="polite">
        {result.status === 'loading' && <LoadingState />}
        {result.status === 'error' && <ErrorState error={result.error} onRetry={result.reload} />}
        {result.status === 'ok' && (result.data.items.length === 0
          ? <EmptyState title="Nothing here yet">The catalogue has no titles for this list.</EmptyState>
          : <>
              <CardGrid items={result.data.items} />
              <Pager page={page} hasNextPage={result.meta.hasNextPage === true} total={result.meta.total} onPage={(p) => setParams(p > 1 ? { page: String(p) } : {})} />
            </>)}
      </div>
    </>
  );
}

function UnavailableBrowse({ title }: { title: string }) {
  return (
    <>
      <header className="kc-page-head"><span className="kc-eyebrow">BROWSE</span><h1>{title}</h1></header>
      <EmptyState title="Not available yet">
        This list needs a filter-only catalogue endpoint. The current search endpoint requires title text. Meanwhile you can <Link className="kc-link" to="/search">search by title</Link>, or open Trending or Recently updated.
      </EmptyState>
    </>
  );
}
