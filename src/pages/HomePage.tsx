import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Info, Play, Plus, Star } from 'lucide-react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { A11y, Autoplay, EffectFade, Keyboard, Navigation, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/effect-fade';
import { CardGrid, ErrorState, MetaChips, Poster, Section, SkeletonGrid, StatusDot, animeHref } from '../components/catalog';
import { useApi, type ApiState } from '../lib/useApi';
import { formatLabel, safeImageUrl, textList, type CatalogCard, type ItemList } from '../lib/catalog';

type CardsState = ApiState<ItemList<CatalogCard>>;
const itemsOf = (state: CardsState): CatalogCard[] => (state.status === 'ok' ? state.data.items : []);
const EMPTY_CARDS: CatalogCard[] = [];

function shuffledCards(items: CatalogCard[]): CatalogCard[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function HomePage() {
  const featured = useApi<ItemList<CatalogCard>>('/catalog/featured');
  const trending = useApi<ItemList<CatalogCard>>('/catalog/trending?limit=12');
  const latest = useApi<ItemList<CatalogCard>>('/catalog/latest?limit=12');
  const airing = useApi<ItemList<CatalogCard>>('/catalog/browse?status=airing&sort=popularity&limit=6');
  const upcoming = useApi<ItemList<CatalogCard>>('/catalog/browse?status=upcoming&sort=popularity&limit=6');

  const main = [featured, trending, latest];
  const loading = main.some((s) => s.status === 'loading');
  const failed = main.find((s) => s.status === 'error');
  // Shuffle the live catalogue response once per fetch/page visit. The titles,
  // artwork and metadata always come from /catalog/featured, never a static list.
  const featuredSource = featured.status === 'ok' ? featured.data.items : EMPTY_CARDS;
  const featuredItems = useMemo(() => shuffledCards(featuredSource), [featuredSource]);
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
  const count = items.length;
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const preferenceChanged = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener('change', preferenceChanged);
    return () => query.removeEventListener('change', preferenceChanged);
  }, []);

  return (
    <section className="kc-hero kc-bleed" aria-label="Featured anime">
      <p className="kc-sr" id="kc-hero-keyboard-help">
        {count > 1
          ? 'Featured anime carousel. Use the left and right arrow keys, the navigation buttons, or swipe to change titles. Titles are selected from the live featured catalogue.'
          : 'Featured anime.'}
      </p>
      <Swiper
        className="kc-hero-swiper"
        modules={[A11y, Autoplay, EffectFade, Keyboard, Navigation, Pagination]}
        effect="fade"
        fadeEffect={{ mode: 'cross-fade' }}
        speed={850}
        loop={count > 1}
        autoplay={count > 1 && !reducedMotion ? {
          delay: 9_000,
          disableOnInteraction: false,
          pauseOnMouseEnter: true,
        } : false}
        keyboard={{ enabled: count > 1, onlyInViewport: true }}
        navigation={count > 1}
        pagination={count > 1 ? { clickable: true } : false}
        lazyPreloadPrevNext={1}
        a11y={{
          enabled: true,
          prevSlideMessage: 'Previous featured anime',
          nextSlideMessage: 'Next featured anime',
          firstSlideMessage: 'This is the first featured anime',
          lastSlideMessage: 'This is the last featured anime',
          paginationBulletMessage: 'Go to featured anime {{index}}',
        }}
      >
        {items.map((item, index) => (
          <SwiperSlide key={item.id}>
            <HeroSlide item={item} priority={index === 0} />
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
}

function HeroSlide({ item, priority }: { item: CatalogCard; priority: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = imageFailed ? null : safeImageUrl(item.bannerUrl);
  // Keep the fact row concise: episode count, year, then genres.
  // For titles without episode/year data, show the format rather than an empty row.
  const episodes = item.episodeCount ? `${item.episodeCount} ${item.episodeCount === 1 ? 'Episode' : 'Episodes'}` : null;
  const year = item.releaseYear ? String(item.releaseYear) : null;
  const format = !episodes && !year && item.format && item.format.toLowerCase() !== 'series'
    ? formatLabel(item.format)
    : null;
  const chips = [episodes, year, format, ...textList(item.genres).slice(0, 3)].filter((v): v is string => Boolean(v));

  return (
    <div className="kc-hero-slide">
      <div className="kc-hero-media" aria-hidden="true">
        {image ? (
          <img
            src={image}
            alt=""
            decoding="async"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="kc-hero-fallback">
            <div className="kc-hero-backdrop"><Poster item={item} /></div>
            <div className="kc-hero-art"><Poster item={item} /></div>
          </div>
        )}
      </div>
      <div className="kc-hero-shade" />
      <div className="kc-hero-copy">
        <h1>{item.title}</h1>
        {chips.length > 0 && <div className="kc-pills">{chips.slice(0, 5).map((chip) => <span key={chip}>{chip}</span>)}</div>}
        {item.synopsis && <p className="kc-hero-synopsis">{item.synopsis}</p>}
        <div className="kc-actions">
          <Link className="kc-btn kc-btn-primary" to={`/watch/${encodeURIComponent(item.slug)}/1`}><Play size={15} fill="currentColor" aria-hidden="true" /> Watch Now</Link>
          <Link className="kc-btn kc-btn-dark" to={animeHref(item)}><Info size={15} aria-hidden="true" /> Details</Link>
          <button type="button" className="kc-icon-btn kc-hero-add" aria-label="Add to list (requires an account)" title="Saving titles will be available when accounts are enabled" disabled><Plus size={19} aria-hidden="true" /></button>
        </div>
      </div>
    </div>
  );
}
