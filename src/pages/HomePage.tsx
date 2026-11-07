import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Play } from 'lucide-react';
import { Poster, Rail, LoadingState, ErrorState, EmptyState } from '../components/catalog';
import { useApi } from '../lib/useApi';
import { episodeCountLabel, formatLabel, safeImageUrl, seasonLabel, textList, type CatalogCard, type ItemList } from '../lib/catalog';

export default function HomePage() {
  const featured = useApi<ItemList<CatalogCard>>('/catalog/featured');
  const trending = useApi<ItemList<CatalogCard>>('/catalog/trending?limit=12');
  const latest = useApi<ItemList<CatalogCard>>('/catalog/latest?limit=12');
  const [activeHero, setActiveHero] = useState(0);

  const all = [featured, trending, latest];
  const loading = all.some((s) => s.status === 'loading');
  const failed = all.find((s) => s.status === 'error');
  const featuredItems = featured.status === 'ok' ? featured.data.items : [];
  const trendingItems = trending.status === 'ok' ? trending.data.items : [];
  const latestItems = latest.status === 'ok' ? latest.data.items : [];
  const catalogueEmpty = all.every((s) => s.status === 'ok') && featuredItems.length + trendingItems.length + latestItems.length === 0;
  const hero = featuredItems.length ? featuredItems[activeHero % featuredItems.length] : null;

  return (
    <>
      {hero ? <Hero item={hero} count={featuredItems.length} active={activeHero % featuredItems.length} onSelect={setActiveHero} /> : (
        <header className="kc-page-head kc-home-heading">
          <span className="kc-eyebrow">WELCOME TO KAIRO</span>
          <h1>Find your next obsession.</h1>
          <p>Discover anime, explore what is trending and keep up with new episodes.</p>
          <Link to="/browse/anime" className="kc-btn kc-btn-primary">Explore anime <ChevronRight size={16} /></Link>
        </header>
      )}

      {loading && <LoadingState label="Loading the catalogue" />}
      {failed && failed.status === 'error' && <ErrorState error={failed.error} onRetry={() => all.forEach((s) => s.reload())} />}
      {catalogueEmpty && <EmptyState title="The catalogue is empty">No titles are available from the configured catalogue providers right now.</EmptyState>}

      <div className="kc-home-columns">
        <div className="kc-home-primary">
          {latestItems.length > 0 && <Rail title="Latest episodes" eyebrow="FRESHLY UPDATED" items={latestItems} to="/browse/latest" />}
          {featuredItems.length > 1 && <Rail title="Featured anime" eyebrow="HAND-PICKED DISCOVERY" items={featuredItems.filter((_, i) => i !== activeHero % featuredItems.length)} />}
          {trendingItems.length > 0 && <Rail title="Trending now" eyebrow="POPULAR THIS WEEK" items={trendingItems} to="/browse/trending" />}
        </div>
        <aside className="kc-home-aside">
          <div className="kc-aside-heading"><div><span className="kc-eyebrow">WHAT'S POPULAR</span><h2>Top airing</h2></div><FlameMark /></div>
          {trendingItems.slice(0, 6).map((item, index) => (
            <Link className="kc-mini-card" to={`/anime/${encodeURIComponent(item.slug)}`} key={item.id}>
              <span className="kc-mini-rank">{String(index + 1).padStart(2, '0')}</span>
              <span className="kc-mini-poster"><Poster item={item} /></span>
              <span className="kc-mini-copy"><b>{item.title}</b><small>{[formatLabel(item.format), item.releaseYear].filter(Boolean).join(' · ') || 'Anime'}</small></span>
              <ChevronRight size={15} aria-hidden="true" />
            </Link>
          ))}
          <Link to="/browse/trending" className="kc-aside-more">See all trending <ChevronRight size={15} /></Link>
        </aside>
      </div>
    </>
  );
}

function FlameMark() { return <span className="kc-aside-flame" aria-hidden="true">✦</span>; }

function Hero({ item, count, active, onSelect }: { item: CatalogCard; count: number; active: number; onSelect: (index: number) => void }) {
  const facts = [formatLabel(item.format), seasonLabel(item.season, item.releaseYear), episodeCountLabel(item.episodeCount)].filter(Boolean);
  const genres = textList(item.genres).slice(0, 4);
  const image = safeImageUrl(item.bannerUrl) ?? safeImageUrl(item.posterUrl);
  return (
    <section className="kc-hero kc-home-hero" aria-labelledby="hero-title">
      <div className="kc-hero-media" aria-hidden="true">
        {image ? <img src={image} alt="" referrerPolicy="no-referrer" /> : <div className="kc-hero-art"><Poster item={item} /></div>}
      </div>
      <div className="kc-hero-shade" />
      <div className="kc-hero-copy">
        <span className="kc-hero-kicker">FEATURED ANIME <i /></span>
        <h1 id="hero-title">{item.title}</h1>
        <div className="kc-hero-pills">{[...facts, ...genres].filter(Boolean).slice(0, 5).map((fact) => <span key={fact}>{fact}</span>)}</div>
        {item.synopsis && <p className="kc-hero-synopsis">{item.synopsis}</p>}
        <div className="kc-actions">
          <Link className="kc-btn kc-btn-primary" to={`/anime/${encodeURIComponent(item.slug)}`}><Play size={15} fill="currentColor" /> View details</Link>
          <Link className="kc-btn kc-btn-glass" to="/browse/anime">Discover more</Link>
        </div>
      </div>
      {count > 1 && <div className="kc-hero-dots" aria-label="Featured titles">
        {Array.from({ length: count }).map((_, index) => <button key={index} type="button" aria-label={`Show featured title ${index + 1}`} aria-current={index === active ? 'true' : undefined} className={index === active ? 'active' : ''} onClick={() => onSelect(index)} />)}
      </div>}
    </section>
  );
}
