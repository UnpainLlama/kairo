import { Link } from 'react-router-dom';
import { Poster, Rail, LoadingState, ErrorState, EmptyState } from '../components/catalog';
import { useApi } from '../lib/useApi';
import { episodeCountLabel, formatLabel, safeImageUrl, seasonLabel, textList, type CatalogCard, type ItemList } from '../lib/catalog';

export default function HomePage() {
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
          <h1>Discover your next anime</h1>
          <p>Search the catalogue or browse what is trending.</p>
        </header>
      )}

      {loading && <LoadingState label="Loading the catalogue" />}
      {failed && failed.status === 'error' && <ErrorState error={failed.error} onRetry={() => all.forEach((s) => s.reload())} />}
      {catalogueEmpty && (
        <EmptyState title="The catalogue is empty">No titles have been imported yet, so there is nothing to show. This is expected until a data source is connected.</EmptyState>
      )}

      {featuredItems.length > 1 && <Rail title="Featured" items={featuredItems.slice(1)} />}
      {trendingItems.length > 0 && <Rail title="Trending" items={trendingItems} to="/browse/trending" />}
      {latestItems.length > 0 && <Rail title="Recently updated" items={latestItems} to="/browse/latest" />}

    </>
  );
}

function Hero({ item }: { item: CatalogCard }) {
  const facts = [formatLabel(item.format), seasonLabel(item.season, item.releaseYear), episodeCountLabel(item.episodeCount)].filter(Boolean);
  const genres = textList(item.genres).slice(0, 3);
  const banner = safeImageUrl(item.bannerUrl);
  return (
    <section className={`kc-hero ${banner ? 'has-banner' : 'has-poster'}`} aria-labelledby="hero-title">
      <div className="kc-hero-media" aria-hidden="true">
        {banner ? <img src={banner} alt="" referrerPolicy="no-referrer" /> : <div className="kc-hero-art"><Poster item={item} /></div>}
      </div>
      <div className="kc-hero-copy">
        <h1 id="hero-title">{item.title}</h1>
        {item.synopsis && <p className="kc-hero-synopsis">{item.synopsis}</p>}
        {(facts.length > 0 || genres.length > 0) && <p className="kc-hero-facts">{[...genres, ...facts].join(' · ')}</p>}
        <div className="kc-actions">
          <Link className="kc-btn kc-btn-primary" to={`/anime/${encodeURIComponent(item.slug)}`}>Learn more</Link>
        </div>
      </div>
    </section>
  );
}
