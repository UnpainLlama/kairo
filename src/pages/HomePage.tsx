import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Info, Play, Plus, Star } from 'lucide-react';
import { CardGrid, ErrorState, MetaChips, Poster, Section, SkeletonGrid, StatusDot, animeHref } from '../components/catalog';
import { useApi, type ApiState } from '../lib/useApi';
import { formatLabel, safeImageUrl, textList, type CatalogCard, type ItemList } from '../lib/catalog';

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

const HERO_INTERVAL_MS = 20_000;
const HERO_FADE_MS = 700;

function Hero({ items }: { items: CatalogCard[] }) {
  const count = items.length;
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden');
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);
  const active = index % count;

  const go = useCallback((target: number) => {
    const next = ((target % count) + count) % count;
    if (next === active) return;
    setLeaving(active);
    setIndex(next);
  }, [active, count]);

  // Keep the 20-second cadence from the currently displayed title. Every manual
  // change starts a fresh interval; a hidden tab never advances behind the user.
  useEffect(() => {
    const visibilityChanged = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => document.removeEventListener('visibilitychange', visibilityChanged);
  }, []);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const preferenceChanged = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener('change', preferenceChanged);
    return () => query.removeEventListener('change', preferenceChanged);
  }, []);
  // Hold the hero artwork in the viewport while the copy scrolls away.
  // The pin distance and fade range are responsive CSS values so desktop and
  // mobile can use different scroll staging without changing this behaviour.
  useEffect(() => {
    let frame = 0;
    const updateArtwork = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const node = heroRef.current;
        if (!node) return;
        const scrollProgress = Math.max(0, -node.getBoundingClientRect().top);
        const styles = window.getComputedStyle(node);
        const pinDistance = Number.parseFloat(styles.getPropertyValue('--kc-hero-art-pin-distance')) || 420;
        const fadeStart = Number.parseFloat(styles.getPropertyValue('--kc-hero-art-fade-start')) || 140;
        const fadeEnd = Number.parseFloat(styles.getPropertyValue('--kc-hero-art-fade-end')) || 820;
        const pinOffset = Math.min(scrollProgress, pinDistance);
        const fadeProgress = Math.min(1, Math.max(0, (scrollProgress - fadeStart) / Math.max(1, fadeEnd - fadeStart)));
        // Smoothstep keeps the fade subtle at first and avoids a harsh cutoff.
        const easedFade = fadeProgress * fadeProgress * (3 - 2 * fadeProgress);
        node.style.setProperty('--kc-hero-art-offset', `${pinOffset}px`);
        node.style.setProperty('--kc-hero-art-opacity', String(1 - easedFade));
      });
    };
    updateArtwork();
    window.addEventListener('scroll', updateArtwork, { passive: true });
    window.addEventListener('resize', updateArtwork);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updateArtwork);
      window.removeEventListener('resize', updateArtwork);
    };
  }, []);

  useEffect(() => {
    if (count < 2 || !pageVisible || reducedMotion) return;
    const timer = window.setTimeout(() => go(active + 1), HERO_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [active, count, pageVisible, reducedMotion, go]);

  // Left/right arrows work anywhere on the home page, except while the user is
  // typing in a field or operating another editable control.
  useEffect(() => {
    if (count < 2) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'))) return;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        go(active + 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(active - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, count, go]);

  // The outgoing slide stays underneath while the new one fades in, then is released.
  useEffect(() => {
    if (leaving === null) return;
    const timer = window.setTimeout(() => setLeaving(null), HERO_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, index]);

  // Only the current, outgoing and neighbouring slides are mounted: neighbours are preloaded so a change never shows an empty frame.
  const mounted = new Set<number>([active, (active + 1) % count, (active - 1 + count) % count]);
  if (leaving !== null) mounted.add(leaving % count);

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = e.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Ignore taps and vertical page scrolling; a clear horizontal swipe changes slide.
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.35) go(active + (dx < 0 ? 1 : -1));
  };

  return (
    <section
      ref={heroRef}
      className="kc-hero kc-bleed"
      aria-roledescription="carousel"
      aria-label="Featured anime"
      aria-describedby="kc-hero-keyboard-help"
      aria-live="off"
      aria-keyshortcuts="ArrowLeft ArrowRight"
      onTouchStart={(e) => {
        touchStart.current = e.touches.length === 1
          ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
          : null;
      }}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => { touchStart.current = null; }}
    >
      <p className="kc-sr" id="kc-hero-keyboard-help">{count > 1 ? 'Use the left and right arrow keys to change featured titles. The featured title also changes automatically every 20 seconds, and the lineup refreshes daily.' : 'Featured anime.'}</p>
      {items.map((item, i) => mounted.has(i) ? (
        <HeroSlide key={item.id} item={item} position={i + 1} total={count} state={i === active ? 'on' : i === leaving ? 'out' : 'idle'} />
      ) : null)}
      {count > 1 && (
        <>
          <button type="button" className="kc-hero-arrow prev" aria-label="Previous featured title" onClick={() => go(active - 1)}><ChevronLeft size={20} aria-hidden="true" /></button>
          <button type="button" className="kc-hero-arrow next" aria-label="Next featured title" onClick={() => go(active + 1)}><ChevronRight size={20} aria-hidden="true" /></button>
          <div className="kc-hero-dots">
            {items.map((entry, i) => <button key={entry.id} type="button" aria-label={`Go to ${entry.title}`} aria-current={i === active ? 'true' : undefined} className={i === active ? 'active' : ''} onClick={() => go(i)} />)}
          </div>
        </>
      )}
    </section>
  );
}

function HeroSlide({ item, position, total, state }: { item: CatalogCard; position: number; total: number; state: 'on' | 'out' | 'idle' }) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = imageFailed ? null : safeImageUrl(item.bannerUrl);
  // Keep the fact row concise like the reference: episode count, year, then genres.
  // For titles without episode/year data, show the format rather than an empty row.
  const episodes = item.episodeCount ? `${item.episodeCount} ${item.episodeCount === 1 ? 'Episode' : 'Episodes'}` : null;
  const year = item.releaseYear ? String(item.releaseYear) : null;
  const format = !episodes && !year && item.format && item.format.toLowerCase() !== 'series'
    ? formatLabel(item.format)
    : null;
  const chips = [episodes, year, format, ...textList(item.genres).slice(0, 3)].filter((v): v is string => Boolean(v));

  return (
    <div className={`kc-slide ${state}`} role="group" aria-roledescription="slide" aria-label={`${position} of ${total}`} inert={state !== 'on'}>
      <div className="kc-hero-media" aria-hidden="true">
        {image ? (
          <img src={image} alt="" decoding="async" fetchPriority={state === 'on' ? 'high' : 'auto'} referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
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
        <div className="kc-pills">{chips.slice(0, 5).map((chip) => <span key={chip}>{chip}</span>)}</div>
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
