import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Info, Play, Star } from 'lucide-react';
import { CardGrid, ErrorState, MetaChips, Poster, Section, SkeletonGrid, StatusDot, animeHref } from '../components/catalog';
import { useApi, type ApiState } from '../lib/useApi';
import { episodeCountLabel, formatLabel, safeImageUrl, seasonLabel, textList, type CatalogCard, type ItemList } from '../lib/catalog';

type CardsState = ApiState<ItemList<CatalogCard>>;
const itemsOf = (state: CardsState): CatalogCard[] => (state.status === 'ok' ? state.data.items : []);

export default function HomePage() {
  const featured = useApi<ItemList<CatalogCard>>('/catalog/featured');
  const trending = useApi<ItemList<CatalogCard>>('/catalog/trending?limit=12');
  const latest = useApi<ItemList<CatalogCard>>('/catalog/latest?limit=12');
  const airing = useApi<ItemList<CatalogCard>>('/catalog/browse?status=airing&sort=popularity&limit=6');
  const upcoming = useApi<ItemList<CatalogCard>>('/catalog/browse?status=upcoming&sort=popularity&limit=6');

  const main = [featured, trending, latest];
  const loading = main.some((s) => s.status === 'loading');
  const failed = main.find((s) => s.status === 'error');
  const featuredItems = itemsOf(featured);
  const trendingItems = itemsOf(trending);
  const latestItems = itemsOf(latest);
  const nothing = main.every((s) => s.status === 'ok') && featuredItems.length + trendingItems.length + latestItems.length === 0;

  return (
    <>
      {featuredItems.length > 0 ? <Hero items={featuredItems} /> : <div className="kc-hero-spacer" />}

      {failed && failed.status === 'error' && <ErrorState error={failed.error} onRetry={() => main.forEach((s) => s.reload())} />}
      {nothing && <div className="kc-notice" role="status"><Info size={20} aria-hidden="true" /><div><h3>Nothing to show yet</h3><p>No titles are available right now. Try again in a moment.</p></div></div>}

      <div className="kc-home-grid">
        <div className="kc-home-main">
          {loading && !failed && <SkeletonGrid count={8} />}
          {latestItems.length > 0 && <Section title="Latest updates" to="/browse/latest"><CardGrid items={latestItems} /></Section>}
          {trendingItems.length > 0 && <Section title="Trending now" to="/browse/trending"><CardGrid items={trendingItems} /></Section>}
        </div>
        <aside className="kc-home-side" aria-label="Lists">
          <SidePanel title="Top airing" items={itemsOf(airing).length ? itemsOf(airing) : trendingItems.slice(0, 6)} />
          <SidePanel title="Upcoming" items={itemsOf(upcoming)} />
        </aside>
      </div>
    </>
  );
}

function SidePanel({ title, items }: { title: string; items: CatalogCard[] }) {
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;
  return (
    <section className="kc-panel">
      <button type="button" className="kc-panel-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <ChevronDown size={15} aria-hidden="true" className={open ? '' : 'turned'} />{title}
      </button>
      {open && (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <Link to={animeHref(item)} className="kc-row">
                <span className="kc-row-poster"><Poster item={item} /></span>
                <span className="kc-row-copy">
                  <b><StatusDot status={item.status} />{item.title}</b>
                  <span className="kc-row-meta"><MetaChips item={item} max={3} />{item.rating !== null && <em><Star size={10} fill="currentColor" aria-hidden="true" />{item.rating}</em>}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Hero({ items }: { items: CatalogCard[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = items.length;

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), 8000);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  const active = index % count;
  const item = items[active];
  const chips = [episodeCountLabel(item.episodeCount), formatLabel(item.format), seasonLabel(item.season, item.releaseYear), ...textList(item.genres).slice(0, 3)].filter((v): v is string => Boolean(v));
  const image = safeImageUrl(item.bannerUrl) ?? safeImageUrl(item.posterUrl);
  const step = (delta: number) => setIndex((active + delta + count) % count);

  return (
    <section className="kc-hero kc-bleed" aria-roledescription="carousel" aria-label="Featured anime" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="kc-hero-media" key={item.id} aria-hidden="true">
        {image ? <img src={image} alt="" referrerPolicy="no-referrer" /> : <div className="kc-hero-art"><Poster item={item} /></div>}
      </div>
      <div className="kc-hero-shade" />
      <div className="kc-hero-copy" aria-live={paused ? 'polite' : 'off'}>
        <h1>{item.title}</h1>
        <div className="kc-pills">{chips.slice(0, 5).map((chip) => <span key={chip}>{chip}</span>)}</div>
        {item.synopsis && <p className="kc-hero-synopsis">{item.synopsis}</p>}
        <div className="kc-actions">
          <Link className="kc-btn kc-btn-primary" to={`/watch/${encodeURIComponent(item.slug)}/1`}><Play size={15} fill="currentColor" aria-hidden="true" /> Watch Now</Link>
          <Link className="kc-btn kc-btn-dark" to={animeHref(item)}><Info size={15} aria-hidden="true" /> Details</Link>
        </div>
      </div>
      {count > 1 && (
        <>
          <button type="button" className="kc-hero-arrow prev" aria-label="Previous featured title" onClick={() => step(-1)}><ChevronLeft size={20} aria-hidden="true" /></button>
          <button type="button" className="kc-hero-arrow next" aria-label="Next featured title" onClick={() => step(1)}><ChevronRight size={20} aria-hidden="true" /></button>
          <div className="kc-hero-dots">
            {items.map((entry, i) => <button key={entry.id} type="button" aria-label={`Show featured title ${i + 1}`} aria-current={i === active ? 'true' : undefined} className={i === active ? 'active' : ''} onClick={() => setIndex(i)} />)}
          </div>
        </>
      )}
    </section>
  );
}
