import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Poster, Rail, LoadingState, ErrorState, EmptyState } from '../components/catalog';
import { useApi } from '../lib/useApi';
import { applyTheme, THEMES } from '../lib/themes';
import { episodeCountLabel, formatLabel, seasonLabel, textList, type CatalogCard, type ItemList } from '../lib/catalog';
import type { ThemeName } from '../types';

export default function HomePage({ theme, onTheme }: { theme: ThemeName; onTheme: (t: ThemeName) => void }) {
  const featured = useApi<ItemList<CatalogCard>>('/catalog/featured');
  const trending = useApi<ItemList<CatalogCard>>('/catalog/trending?limit=12');
  const latest = useApi<ItemList<CatalogCard>>('/catalog/latest?limit=12');

  const all = [featured, trending, latest];
  const loading = all.some((s) => s.status === 'loading');
  const failed = all.find((s) => s.status === 'error');
  const featuredItems = featured.status === 'ok' ? featured.data.items : [];
  const trendingItems = trending.status === 'ok' ? trending.data.items : [];
  const latestItems = latest.status === 'ok' ? latest.data.items : [];
  const catalogueEmpty = all.every((s) => s.status === 'ok') && featuredItems.length + trendingItems.length + latestItems.length === 0;
  const hero = featuredItems[0];

  return (
    <>
      {hero ? <Hero item={hero} /> : (
        <header className="kc-page-head">
          <span className="kc-eyebrow">KAIRO</span>
          <h1>Discover your next anime</h1>
          <p>Search the catalogue or browse what is trending.</p>
        </header>
      )}

      {loading && <LoadingState label="Loading the catalogue" />}
      {failed && failed.status === 'error' && <ErrorState error={failed.error} onRetry={() => all.forEach((s) => s.reload())} />}
      {catalogueEmpty && (
        <EmptyState title="The catalogue is empty">No titles have been imported yet, so there is nothing to show. This is expected until a data source is connected.</EmptyState>
      )}

      {featuredItems.length > 1 && <Rail eyebrow="HANDPICKED" title="Featured" items={featuredItems.slice(1)} />}
      {trendingItems.length > 0 && <Rail eyebrow="BY POPULARITY" title="Trending" items={trendingItems} to="/browse/trending" />}
      {latestItems.length > 0 && <Rail eyebrow="NEWEST CHANGES" title="Recently updated" items={latestItems} to="/browse/latest" />}

      <section className="kc-section" aria-labelledby="theme-heading">
        <div className="kc-section-head"><div><span className="kc-eyebrow">APPEARANCE</span><h2 id="theme-heading">Choose a theme</h2></div></div>
        <div className="kc-themes">
          {THEMES.map((t) => (
            <button type="button" key={t.id} className={`kc-theme ${theme === t.id ? 'is-selected' : ''}`} aria-pressed={theme === t.id} onClick={() => { applyTheme(t.id); onTheme(t.id); }}>
              <span className="kc-swatches" aria-hidden="true">{t.swatches.map((c) => <i key={c} style={{ background: c }} />)}</span>
              <span>{t.label}</span>
              {theme === t.id && <Check size={16} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function Hero({ item }: { item: CatalogCard }) {
  const facts = [formatLabel(item.format), seasonLabel(item.season, item.releaseYear), episodeCountLabel(item.episodeCount)].filter(Boolean);
  const genres = textList(item.genres).slice(0, 4);
  return (
    <section className="kc-hero" aria-labelledby="hero-title">
      <div className="kc-hero-copy">
        <span className="kc-eyebrow">FEATURED</span>
        <h1 id="hero-title">{item.title}</h1>
        {facts.length > 0 && <p className="kc-hero-facts">{facts.join(' · ')}</p>}
        {item.synopsis && <p className="kc-hero-synopsis">{item.synopsis}</p>}
        {genres.length > 0 && <ul className="kc-tags" aria-label="Genres">{genres.map((g) => <li key={g}>{g}</li>)}</ul>}
        <Link className="kc-btn kc-btn-primary" to={`/anime/${encodeURIComponent(item.slug)}`}>View details</Link>
      </div>
      <div className="kc-hero-art"><Poster item={item} /></div>
    </section>
  );
}
