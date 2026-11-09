import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, Info, RefreshCw, Star } from 'lucide-react';
import type { ApiError } from '../lib/api';
import { formatLabel, safeImageUrl, textList, type CatalogCard } from '../lib/catalog';

export const animeHref = (item: Pick<CatalogCard, 'slug'>): string => `/anime/${encodeURIComponent(item.slug)}`;

/** Remote artwork is hotlinked and never re-hosted. With no usable image we show a plain placeholder, not invented art. */
export function Poster({ item }: { item: Pick<CatalogCard, 'title' | 'posterUrl'> }) {
  const [failed, setFailed] = useState(false);
  const src = safeImageUrl(item.posterUrl);
  if (!src || failed) {
    return <div className="kc-poster-fallback" role="img" aria-label={`No artwork available for ${item.title}`}><span>{item.title.slice(0, 2).toUpperCase()}</span></div>;
  }
  return <img className="kc-poster-img" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

/** The small status/format/year chips shown under posters and in compact rows. */
export function MetaChips({ item, max = 4 }: { item: CatalogCard; max?: number }) {
  const chips = [
    item.episodeCount ? `${item.episodeCount} ep` : null,
    formatLabel(item.format),
    item.releaseYear ? String(item.releaseYear) : null,
  ].filter((v): v is string => Boolean(v));
  if (chips.length === 0) return null;
  return <div className="kc-chips">{chips.slice(0, max).map((chip) => <span key={chip}>{chip}</span>)}</div>;
}

export function StatusDot({ status }: { status: string | null }) {
  const s = (status ?? '').toLowerCase();
  const tone = s === 'airing' ? 'green' : s === 'upcoming' ? 'amber' : s === 'finished' ? 'blue' : 'grey';
  return <i className={`kc-dot kc-dot-${tone}`} aria-hidden="true" />;
}

export function AnimeCard({ item }: { item: CatalogCard }) {
  return (
    <article className="kc-card">
      <Link to={animeHref(item)} className="kc-poster" aria-label={`Open ${item.title}`}>
        <Poster item={item} />
        {item.rating !== null && <span className="kc-poster-score"><Star size={11} fill="currentColor" aria-hidden="true" />{item.rating}<span className="kc-sr"> rating</span></span>}
      </Link>
      <MetaChips item={item} />
      <Link to={animeHref(item)} className="kc-card-title">{item.title}</Link>
    </article>
  );
}

export function CardGrid({ items }: { items: CatalogCard[] }) {
  return <div className="kc-grid">{items.map((item) => <AnimeCard key={item.id} item={item} />)}</div>;
}

/** Wide card used on Trending: poster on the left, title, chips and a short synopsis. */
export function WideCard({ item }: { item: CatalogCard }) {
  const genres = textList(item.genres).slice(0, 3);
  return (
    <Link to={animeHref(item)} className="kc-wide" aria-label={`Open ${item.title}`}>
      <span className="kc-wide-poster"><Poster item={item} /></span>
      <span className="kc-wide-copy">
        <b>{item.title}</b>
        <span className="kc-wide-meta"><StatusDot status={item.status} /><MetaChips item={item} />{item.rating !== null && <span className="kc-wide-score"><Star size={11} fill="currentColor" aria-hidden="true" />{item.rating}</span>}</span>
        {genres.length > 0 && <small>{genres.join(' · ')}</small>}
        {item.synopsis && <p>{item.synopsis}</p>}
      </span>
    </Link>
  );
}

export function Section({ title, to, children }: { title: string; to?: string; children: ReactNode }) {
  return (
    <section className="kc-section">
      <div className="kc-section-head">
        <h2>{title}</h2>
        {to && <Link className="kc-more" to={to}>View all <ChevronRight size={14} aria-hidden="true" /></Link>}
      </div>
      {children}
    </section>
  );
}

export function Rail({ title, items, to }: { title: string; items: CatalogCard[]; to?: string }) {
  return (
    <Section title={title} to={to}>
      <div className="kc-hrail">{items.map((item) => <AnimeCard key={item.id} item={item} />)}</div>
    </Section>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return <div className="kc-loading" role="status" aria-live="polite"><span className="kc-spinner" aria-hidden="true" />{label}…</div>;
}

export function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="kc-grid" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => <div className="kc-skel" key={i}><span /><i /></div>)}
    </div>
  );
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
      <button type="button" className="kc-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={15} aria-hidden="true" /> Prev</button>
      <span aria-live="polite">Page {page}{typeof total === 'number' ? ` · ${total} titles` : ''}</span>
      <button type="button" className="kc-btn kc-btn-dark" disabled={!hasNextPage} onClick={() => onPage(page + 1)}>Next <ChevronRight size={15} aria-hidden="true" /></button>
    </nav>
  );
}
