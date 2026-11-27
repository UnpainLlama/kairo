import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Info, Play, Star } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState, Pager, Poster, Rail, StatusDot } from '../components/catalog';
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
        <p><Link className="kc-link" to="/search">Search for another title</Link></p>
      </>
    );
  }

  const u = enriched.status === 'ok' ? enriched.data : null;
  const a: AnimeDetails = u
    ? { ...details.data, synopsis: u.synopsis ?? details.data.synopsis, rating: u.rating ?? details.data.rating, episodeCount: u.episodeCount ?? details.data.episodeCount,
        posterUrl: u.posterUrl ?? details.data.posterUrl, bannerUrl: u.bannerUrl ?? details.data.bannerUrl, genres: u.genres.length ? u.genres : details.data.genres }
    : details.data;
  const genres = textList(a.genres);
  const alt = textList(a.altTitles);
  const facts = [formatLabel(a.format), seasonLabel(a.season, a.releaseYear), episodeCountLabel(a.episodeCount)].filter((v): v is string => Boolean(v));
  const backdrop = safeImageUrl(a.bannerUrl);
  const status = statusLabel(a.status);

  return (
    <article className="kc-detail">
      <section className="kc-detail-hero kc-bleed" aria-labelledby="anime-title">
        {backdrop && <img className="kc-detail-backdrop" src={backdrop} alt="" referrerPolicy="no-referrer" />}
        <div className="kc-detail-shade" />
        <div className="kc-detail-hero-inner">
          <div className="kc-detail-art"><Poster item={a} /></div>
          <div className="kc-detail-copy">
            <Link to="/browse/anime" className="kc-back-link"><ArrowLeft size={15} aria-hidden="true" /> Discover</Link>
            <h1 id="anime-title">{a.title}</h1>
            {alt.length > 0 && <p className="kc-alt">{alt.slice(0, 3).join(' · ')}</p>}
            <div className="kc-pills">
              {status && <span className="kc-pill-status"><StatusDot status={a.status} />{status}</span>}
              {facts.map((fact) => <span key={fact}>{fact}</span>)}
              {a.rating !== null && <span className="kc-pill-score"><Star size={12} fill="currentColor" aria-hidden="true" />{a.rating}<small> / 10</small></span>}
            </div>
            {genres.length > 0 && <ul className="kc-tags" aria-label="Genres">{genres.map((g) => <li key={g}>{g}</li>)}</ul>}
            <p className="kc-detail-synopsis">{a.synopsis || 'No synopsis is available for this title.'}</p>
            <div className="kc-actions">
              <Link className="kc-btn kc-btn-primary" to={`/watch/${key}/1`}><Play size={15} fill="currentColor" aria-hidden="true" /> Watch Now</Link>
              <a className="kc-btn kc-btn-dark" href="#episodes"><Info size={15} aria-hidden="true" /> Episodes</a>
            </div>
          </div>
        </div>
      </section>

      <div className="kc-detail-content">
        <Episodes slug={key} />
        <Related slug={key} />
        <Sources enriched={enriched.status === 'ok' ? enriched.data : null} failed={enriched.status === 'error'} loading={enriched.status === 'loading'} />
      </div>
    </article>
  );
}

function Sources({ enriched, failed, loading }: { enriched: UnifiedMetadata | null; failed: boolean; loading: boolean }) {
  const someFailed = enriched?.providers.some((p) => p.state === 'failed') ?? false;
  return (
    <section className="kc-sources" aria-label="Data sources">
      {loading && <p>Loading extra details…</p>}
      {failed && <p>Extra details are unavailable right now.</p>}
      {someFailed && <p>Some details could not be loaded, so this page may be incomplete.</p>}
      {enriched && enriched.sources.length > 0 && (
        <p>Data from {enriched.sources.map((s, i) => <span key={s.providerId}>{i > 0 ? ', ' : ''}<a className="kc-link" href={s.url} target="_blank" rel="noopener noreferrer">{s.displayName}</a>{s.license ? ` (${s.license})` : ''}</span>)}.</p>
      )}
    </section>
  );
}

function Episodes({ slug }: { slug: string }) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [slug]);
  const result = useApi<ItemList<Episode>>(`/anime/${slug}/episodes?page=${page}&limit=50`);
  return (
    <section id="episodes" className="kc-section" aria-labelledby="episodes-heading">
      <div className="kc-section-head"><h2 id="episodes-heading">Episodes</h2></div>
      <div aria-live="polite">
        {result.status === 'loading' && <LoadingState label="Loading episodes" />}
        {result.status === 'error' && <ErrorState error={result.error} onRetry={result.reload} />}
        {result.status === 'ok' && (result.data.items.length === 0
          ? <EmptyState title="No episodes listed">There is no episode information for this title yet.</EmptyState>
          : <>
              <ol className="kc-episodes">
                {result.data.items.map((ep) => {
                  const thumb = safeImageUrl(ep.thumbnailUrl);
                  const extra = [durationLabel(ep.durationSeconds), dateLabel(ep.publishedAt)].filter(Boolean).join(' · ');
                  return (
                    <li key={ep.id}>
                      <Link className="kc-episode" to={`/watch/${slug}/${ep.episodeNumber}`} aria-label={`Open episode ${ep.episodeNumber}`}>
                        <span className="kc-episode-thumb">
                          {thumb ? <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Play size={18} aria-hidden="true" />}
                          <span className="kc-ep-badge">EP {episodeNumberLabel(ep.episodeNumber)}</span>
                        </span>
                        <span className="kc-episode-copy">
                          <b>{ep.title || `Episode ${episodeNumberLabel(ep.episodeNumber)}`}</b>
                          {extra && <small>{extra}</small>}
                          {ep.synopsis && <p>{ep.synopsis}</p>}
                        </span>
                      </Link>
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
  if (result.status !== 'ok' || result.data.items.length === 0) return null;
  return <Rail title="You may also like" items={result.data.items} />;
}
