import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, Play, Star } from 'lucide-react';
import { Poster, Rail, EmptyState, ErrorState, LoadingState, Pager } from '../components/catalog';
import { useApi } from '../lib/useApi';
import {
  dateLabel, durationLabel, episodeCountLabel, episodeNumberLabel, formatLabel, safeImageUrl, seasonLabel, statusLabel, textList,
  type AnimeDetails, type CatalogCard, type Episode, type ItemList, type UnifiedMetadata,
} from '../lib/catalog';

export default function AnimePage() {
  const { slug = '' } = useParams();
  const key = encodeURIComponent(slug);
  const details = useApi<AnimeDetails>(`/anime/${key}`);
  const enriched = useApi<UnifiedMetadata>(`/anime/${key}/metadata`);

  if (details.status === 'loading') return <LoadingState label="Loading title" />;
  if (details.status === 'error') {
    return (
      <>
        <ErrorState error={details.error} onRetry={details.reload} />
        <p><Link className="kc-link" to="/search">Search the catalogue</Link></p>
      </>
    );
  }

  const u = enriched.status === 'ok' ? enriched.data : null;
  const a: AnimeDetails = u
    ? { ...details.data, synopsis: u.synopsis ?? details.data.synopsis, rating: u.rating ?? details.data.rating, episodeCount: u.episodeCount ?? details.data.episodeCount,
        posterUrl: u.posterUrl ?? details.data.posterUrl, bannerUrl: u.bannerUrl ?? details.data.bannerUrl, genres: u.genres.length ? u.genres : details.data.genres }
    : details.data;
  const someFailed = u?.providers.some((p) => p.state === 'failed') ?? false;
  const genres = textList(a.genres);
  const alt = textList(a.altTitles);
  const facts = [formatLabel(a.format), statusLabel(a.status), seasonLabel(a.season, a.releaseYear), episodeCountLabel(a.episodeCount)].filter(Boolean);
  const backdrop = safeImageUrl(a.bannerUrl) ?? safeImageUrl(a.posterUrl);

  return (
    <article className="kc-detail">
      <section className="kc-detail-hero" aria-labelledby="anime-title">
        {backdrop && <img className="kc-detail-backdrop" src={backdrop} alt="" referrerPolicy="no-referrer" />}
        <div className="kc-detail-backdrop-shade" />
        <div className="kc-detail-hero-copy">
          <Link to="/browse/anime" className="kc-back-link"><ArrowLeft size={15} /> Discover anime</Link>
          <span className="kc-eyebrow">ANIME DETAILS</span>
          <h1 id="anime-title">{a.title}</h1>
          {alt.length > 0 && <p className="kc-alt">Also known as: {alt.slice(0, 4).join(' · ')}</p>}
          {facts.length > 0 && <div className="kc-detail-facts">{facts.map((fact) => <span key={fact}>{fact}</span>)}</div>}
          {a.rating !== null && <p className="kc-detail-rating"><Star size={15} fill="currentColor" /> {a.rating} <span>/ 10</span></p>}
          {genres.length > 0 && <ul className="kc-tags" aria-label="Genres">{genres.map((g) => <li key={g}>{g}</li>)}</ul>}
          <h2 className="kc-detail-synopsis-title">Synopsis</h2>
          <p className="kc-detail-synopsis">{a.synopsis || 'No synopsis is available for this title.'}</p>
          <div className="kc-actions">
            <a className="kc-btn kc-btn-primary" href="#episodes"><ArrowDown size={16} /> Episodes</a>
            <button type="button" className="kc-btn kc-btn-glass" disabled aria-describedby="watch-note"><Play size={15} fill="currentColor" /> Watch now</button>
          </div>
          <p id="watch-note" className="kc-hint kc-watch-note">Playback is not connected yet. Kairo currently provides catalogue and episode information.</p>
        </div>
        <div className="kc-detail-art"><Poster item={a} /></div>
      </section>

      <div className="kc-detail-content">
        <section className="kc-detail-information" aria-label="Additional title information">
          <div><span className="kc-eyebrow">TITLE</span><b>{a.title}</b></div>
          <div><span className="kc-eyebrow">FORMAT</span><b>{formatLabel(a.format) ?? 'Unknown'}</b></div>
          <div><span className="kc-eyebrow">STATUS</span><b>{statusLabel(a.status) ?? 'Unknown'}</b></div>
          <div><span className="kc-eyebrow">RELEASE</span><b>{seasonLabel(a.season, a.releaseYear) ?? 'Unknown'}</b></div>
        </section>

        <section className="kc-sources" aria-label="Data sources">
          {enriched.status === 'loading' && <p className="kc-hint">Loading details from data providers…</p>}
          {enriched.status === 'error' && <p className="kc-hint">Extra details from data providers are unavailable right now. Showing the catalogue record only.</p>}
          {someFailed && <p className="kc-hint">Some data providers could not be reached, so details may be incomplete.</p>}
          {u && u.sources.length > 0 && <ul>{u.sources.map((s) => <li key={s.providerId}><a className="kc-link" href={s.url} target="_blank" rel="noopener noreferrer">{s.displayName}</a>: {s.text}{s.license ? ` (${s.license})` : ''}</li>)}</ul>}
        </section>
        <Episodes slug={key} />
        <Related slug={key} />
      </div>
    </article>
  );
}

function Episodes({ slug }: { slug: string }) {
  const [page, setPage] = useState(1);
  const result = useApi<ItemList<Episode>>(`/anime/${slug}/episodes?page=${page}&limit=50`);
  return (
    <section id="episodes" className="kc-section kc-episode-section" aria-labelledby="episodes-heading">
      <div className="kc-section-head"><div><span className="kc-eyebrow">EPISODE GUIDE</span><h2 id="episodes-heading">Episodes</h2></div></div>
      <div aria-live="polite">
        {result.status === 'loading' && <LoadingState label="Loading episodes" />}
        {result.status === 'error' && <ErrorState error={result.error} onRetry={result.reload} />}
        {result.status === 'ok' && (result.data.items.length === 0
          ? <EmptyState title="No episode information">No episodes are listed for this title.</EmptyState>
          : <>
              <ol className="kc-episodes" start={result.data.items[0] ? Math.floor(result.data.items[0].episodeNumber) : 1}>
                {result.data.items.map((ep) => {
                  const thumb = safeImageUrl(ep.thumbnailUrl);
                  const extra = [durationLabel(ep.durationSeconds), dateLabel(ep.publishedAt)].filter(Boolean).join(' · ');
                  return (
                    <li key={ep.id} value={Number.isInteger(ep.episodeNumber) ? ep.episodeNumber : undefined}>
                      <Link className="kc-episode-link" to={`/watch/${slug}/${ep.episodeNumber}`} aria-label={`Open episode ${ep.episodeNumber}`}>
                        <span className="kc-episode-number">{episodeNumberLabel(ep.episodeNumber).padStart(2, '0')}</span>
                        <div className="kc-episode-thumb">{thumb ? <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Play size={19} aria-hidden="true" />}</div>
                        <div className="kc-episode-copy">
                          <b>Episode {episodeNumberLabel(ep.episodeNumber)}{ep.title ? `: ${ep.title}` : ''}</b>
                          {extra && <span>{extra}</span>}
                          {ep.synopsis && <p>{ep.synopsis}</p>}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ol>
              <Pager page={page} hasNextPage={result.meta.hasNextPage === true} total={result.meta.total} onPage={setPage} />
            </>) }
      </div>
    </section>
  );
}

function Related({ slug }: { slug: string }) {
  const result = useApi<ItemList<CatalogCard>>(`/anime/${slug}/related?limit=12`);
  if (result.status === 'loading') return <LoadingState label="Loading related titles" />;
  if (result.status === 'error') return <ErrorState error={result.error} onRetry={result.reload} />;
  if (result.data.items.length === 0) return null;
  return <Rail title="You may also like" eyebrow="MORE TO EXPLORE" items={result.data.items} />;
}
