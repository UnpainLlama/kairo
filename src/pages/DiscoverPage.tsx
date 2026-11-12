import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Info, Play, Shuffle } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState, Poster, animeHref } from '../components/catalog';
import { useApi } from '../lib/useApi';
import { episodeCountLabel, formatLabel, safeImageUrl, seasonLabel, textList, type CatalogCard, type GenreCount, type ItemList } from '../lib/catalog';

/** Discover: a themed showcase. Pick a genre, flip through its most popular titles, or jump to a random one. */
export default function DiscoverPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const genre = (params.get('genre') ?? '').slice(0, 40);
  const genres = useApi<ItemList<GenreCount>>('/catalog/genres');
  const path = `/catalog/browse?sort=popularity&limit=12${genre ? `&genre=${encodeURIComponent(genre)}` : ''}`;
  const result = useApi<ItemList<CatalogCard>>(path);
  const [picked, setPicked] = useState<{ path: string; index: number }>({ path: '', index: 0 });

  const collections = genres.status === 'ok'
    ? [...genres.data.items].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 14).map((g) => g.name)
    : [];
  if (genre && !collections.includes(genre)) collections.unshift(genre);

  const items = result.status === 'ok' ? result.data.items : [];
  const index = picked.path === path && picked.index < items.length ? picked.index : 0;
  const item = items[index];
  const others = items.map((entry, i) => ({ entry, i })).filter(({ i }) => i !== index);

  const surprise = () => {
    if (items.length === 0) return;
    const choices = items.filter((_, i) => i !== index);
    const pool = choices.length ? choices : items;
    navigate(animeHref(pool[Math.floor(Math.random() * pool.length)]));
  };

  const backdrop = item ? safeImageUrl(item.bannerUrl) : null;
  const chips = item ? [formatLabel(item.format), seasonLabel(item.season, item.releaseYear), episodeCountLabel(item.episodeCount), ...textList(item.genres).slice(0, 3)].filter((v): v is string => Boolean(v)) : [];

  return (
    <div className="kc-discover">
      {backdrop && <img className="kc-discover-bg" src={backdrop} alt="" aria-hidden="true" referrerPolicy="no-referrer" />}

      <header className="kc-page-head kc-discover-head">
        <div><h1>Discover</h1><p>{genre ? `${genre} · most popular` : 'Most popular right now'}</p></div>
        <button type="button" className="kc-btn kc-btn-dark" onClick={surprise} disabled={items.length === 0}><Shuffle size={15} aria-hidden="true" /> Surprise me</button>
      </header>

      <div className="kc-collections" role="group" aria-label="Collections">
        <button type="button" className={genre === '' ? 'active' : ''} onClick={() => setParams({})}>Popular</button>
        {collections.map((name) => <button key={name} type="button" className={name === genre ? 'active' : ''} onClick={() => setParams({ genre: name })}>{name}</button>)}
      </div>

      {result.status === 'loading' && <LoadingState label="Loading titles" />}
      {result.status === 'error' && <ErrorState error={result.error} onRetry={result.reload} />}
      {result.status === 'ok' && items.length === 0 && <EmptyState title="Nothing here yet">No titles were found for this collection.</EmptyState>}

      {item && (
        <>
          <div className="kc-showcase">
            <Link to={animeHref(item)} className="kc-showcase-main" aria-label={`Open ${item.title}`}>
              {backdrop ? <img src={backdrop} alt="" referrerPolicy="no-referrer" /> : <Poster item={item} />}
            </Link>
            {others.map(({ entry, i }) => (
              <button key={entry.id} type="button" className="kc-showcase-thumb" aria-label={`Show ${entry.title}`} onClick={() => setPicked({ path, index: i })}>
                <Poster item={entry} />
              </button>
            ))}
          </div>
          <div className="kc-showcase-copy">
            <h2>{item.title}</h2>
            <div className="kc-showcase-facts">{chips.map((chip) => <span key={chip}>{chip}</span>)}</div>
            {item.synopsis && <p>{item.synopsis}</p>}
            <div className="kc-actions">
              <Link className="kc-btn kc-btn-primary" to={`/watch/${encodeURIComponent(item.slug)}/1`}><Play size={15} fill="currentColor" aria-hidden="true" /> Watch</Link>
              <Link className="kc-btn kc-btn-dark" to={animeHref(item)}><Info size={15} aria-hidden="true" /> Details</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
