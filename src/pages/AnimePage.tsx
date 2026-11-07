import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
  // The stored record shows immediately; provider details fill gaps when they arrive. A provider failure never hides the page.
  const u = enriched.status === 'ok' ? enriched.data : null;
  const a: AnimeDetails = u
    ? { ...details.data, synopsis: u.synopsis ?? details.data.synopsis, rating: u.rating ?? details.data.rating, episodeCount: u.episodeCount ?? details.data.episodeCount,
        posterUrl: u.posterUrl ?? details.data.posterUrl, bannerUrl: u.bannerUrl ?? details.data.bannerUrl, genres: u.genres.length ? u.genres : details.data.genres }
    : details.data;
  const someFailed = u?.providers.some((p) => p.state === 'failed') ?? false;
  const genres = textList(a.genres);
  const alt = textList(a.altTitles);
  const facts = [formatLabel(a.format), statusLabel(a.status), seasonLabel(a.season, a.releaseYear), episodeCountLabel(a.episodeCount)].filter(Boolean);
  const banner = safeImageUrl(a.bannerUrl);

  return (
    <article className="kc-detail">
      {banner && <img className="kc-banner" src={banner} alt="" loading="lazy" referrerPolicy="no-referrer" />}
      <div className="kc-detail-main">
        <div className="kc-detail-poster"><Poster item={a} /></div>
        <div className="kc-detail-copy">
          <span className="kc-eyebrow">TITLE</span>
          <h1>{a.title}</h1>
          {alt.length > 0 && <p className="kc-alt">Also known as: {alt.slice(0, 4).join(' · ')}</p>}
          {facts.length > 0 && <p className="kc-hero-facts">{facts.join(' · ')}</p>}
          {a.rating !== null && <p className="kc-hero-facts">Rating: {a.rating}</p>}
          {genres.length > 0 && <ul className="kc-tags" aria-label="Genres">{genres.map((g) => <li key={g}>{g}</li>)}</ul>}
          <h2 className="kc-h2">Synopsis</h2>
          <p className="kc-synopsis">{a.synopsis || 'No synopsis is available for this title.'}</p>
          <div className="kc-actions">
            <button type="button" className="kc-btn kc-btn-primary" disabled aria-describedby="watch-note">Watch</button>
            <button type="button" className="kc-btn" disabled aria-describedby="library-note">Add to library</button>
          </div>
          <p id="watch-note" className="kc-hint">Watching is unavailable: no authorized playback provider is connected.</p>
          <p id="library-note" className="kc-hint">Libraries need an account, and sign-in is not set up yet.</p>
        </div>
      </div>
      <section className="kc-sources" aria-label="Data sources">
        {enriched.status === 'loading' && <p className="kc-hint">Loading details from data providers…</p>}
        {enriched.status === 'error' && <p className="kc-hint">Extra details from data providers are unavailable right now. Showing the catalogue record only.</p>}
        {someFailed && <p className="kc-hint">Some data providers could not be reached, so details may be incomplete.</p>}
        {u && u.sources.length > 0 && (
          <ul>{u.sources.map((s) => <li key={s.providerId}><a className="kc-link" href={s.url} target="_blank" rel="noopener noreferrer">{s.displayName}</a>: {s.text}{s.license ? ` (${s.license})` : ''}</li>)}</ul>
        )}
      </section>
      <Episodes slug={key} />
      <Related slug={key} />
    </article>
  );
}

function Episodes({ slug }: { slug: string }) {
  const [page, setPage] = useState(1);
  const result = useApi<ItemList<Episode>>(`/anime/${slug}/episodes?page=${page}&limit=50`);
  return (
    <section className="kc-section" aria-labelledby="episodes-heading">
      <div className="kc-section-head"><h2 id="episodes-heading">Episodes</h2></div>
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
                      {thumb && <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                      <div>
                        <b>Episode {episodeNumberLabel(ep.episodeNumber)}{ep.title ? `: ${ep.title}` : ''}</b>
                        {extra && <span>{extra}</span>}
                        {ep.synopsis && <p>{ep.synopsis}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <Pager page={page} hasNextPage={result.meta.hasNextPage === true} total={result.meta.total} onPage={setPage} />
            </>)}
      </div>
    </section>
  );
}

function Related({ slug }: { slug: string }) {
  const result = useApi<ItemList<CatalogCard>>(`/anime/${slug}/related?limit=12`);
  if (result.status === 'loading') return <LoadingState label="Loading related titles" />;
  if (result.status === 'error') return <ErrorState error={result.error} onRetry={result.reload} />;
  if (result.data.items.length === 0) return null;
  return <Rail title="Related titles" items={result.data.items} />;
}
