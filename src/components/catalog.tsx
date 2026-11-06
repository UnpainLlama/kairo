import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Info, RefreshCw, Star } from 'lucide-react';
import type { ApiError } from '../lib/api';
import { formatLabel, safeImageUrl, textList, type CatalogCard } from '../lib/catalog';

/** Remote artwork is hotlinked and never re-hosted. With no usable image we show a plain placeholder, not invented art. */
export function Poster({ item }: { item: Pick<CatalogCard, 'title' | 'posterUrl'> }) {
  const [failed, setFailed] = useState(false);
  const src = safeImageUrl(item.posterUrl);
  if (!src || failed) {
    return <div className="kc-poster-fallback" role="img" aria-label={`No artwork available for ${item.title}`}><span>{item.title.slice(0, 2).toUpperCase()}</span></div>;
  }
  return <img className="kc-poster-img" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

export function AnimeCard({ item }: { item: CatalogCard }) {
  const meta = [item.releaseYear ? String(item.releaseYear) : null, formatLabel(item.format)].filter(Boolean).join(' · ');
  return (
    <article className="kc-card">
      <Link to={`/anime/${encodeURIComponent(item.slug)}`} className="kc-poster" aria-label={`Open ${item.title}`}>
        <Poster item={item} />
      </Link>
      <div className="kc-card-body">
        <Link to={`/anime/${encodeURIComponent(item.slug)}`} className="kc-card-title">{item.title}</Link>
        <p className="kc-card-sub">
          {meta || 'Details unavailable'}
          {item.rating !== null && <span className="kc-rating"><Star size={13} aria-hidden="true" /> {item.rating}<span className="kc-sr"> rating</span></span>}
        </p>
        {textList(item.genres).length > 0 && <p className="kc-card-genres">{textList(item.genres).slice(0, 3).join(' · ')}</p>}
      </div>
    </article>
  );
}

export function CardGrid({ items }: { items: CatalogCard[] }) {
  return <div className="kc-grid">{items.map((item) => <AnimeCard key={item.id} item={item} />)}</div>;
}

export function Rail({ title, eyebrow, items, to }: { title: string; eyebrow?: string; items: CatalogCard[]; to?: string }) {
  return (
    <section className="kc-section" aria-labelledby={`rail-${title.replace(/\W+/g, '-')}`}>
      <div className="kc-section-head">
        <div>{eyebrow && <span className="kc-eyebrow">{eyebrow}</span>}<h2 id={`rail-${title.replace(/\W+/g, '-')}`}>{title}</h2></div>
        {to && <Link className="kc-link" to={to}>View all</Link>}
      </div>
      <div className="kc-rail">{items.map((item) => <AnimeCard key={item.id} item={item} />)}</div>
    </section>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return <div className="kc-loading" role="status" aria-live="polite"><span className="kc-spinner" aria-hidden="true" />{label}…</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="kc-notice" role="status"><Info size={20} aria-hidden="true" /><div><h3>{title}</h3>{children && <p>{children}</p>}</div></div>;
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div className="kc-notice kc-notice-error" role="alert">
      <AlertTriangle size={20} aria-hidden="true" />
      <div>
        <h3>{error.status === 404 ? 'Not found' : 'Something went wrong'}</h3>
        <p>{error.message}</p>
        {onRetry && error.status !== 404 && <button type="button" className="kc-btn" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" /> Try again</button>}
      </div>
    </div>
  );
}

export function Pager({ page, hasNextPage, total, onPage }: { page: number; hasNextPage: boolean; total?: number; onPage: (page: number) => void }) {
  if (page === 1 && !hasNextPage) return null;
  return (
    <nav className="kc-pager" aria-label="Pagination">
      <button type="button" className="kc-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span aria-live="polite">Page {page}{typeof total === 'number' ? ` · ${total} titles` : ''}</span>
      <button type="button" className="kc-btn" disabled={!hasNextPage} onClick={() => onPage(page + 1)}>Next</button>
    </nav>
  );
}
