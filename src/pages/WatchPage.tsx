import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ListVideo, Play, ShieldAlert } from 'lucide-react';
import { ErrorState, LoadingState } from '../components/catalog';
import { useApi } from '../lib/useApi';
import { dateLabel, durationLabel, episodeNumberLabel, safeImageUrl, type AnimeDetails, type Episode, type EpisodeServer, type ItemList } from '../lib/catalog';

type ServerList = ItemList<EpisodeServer>;

export default function WatchPage() {
  const { slug = '', episodeNumber: rawEpisode = '1' } = useParams();
  const key = encodeURIComponent(slug);
  const parsedEpisode = Number(rawEpisode);
  const validEpisode = Number.isInteger(parsedEpisode) && parsedEpisode >= 1 && parsedEpisode <= 100000;
  const details = useApi<AnimeDetails>(`/anime/${key}`);
  const episodes = useApi<ItemList<Episode>>(`/anime/${key}/episodes?page=1&limit=50`);
  const servers = useApi<ServerList>(validEpisode ? `/anime/${key}/episodes/${parsedEpisode}/servers` : null);

  if (!validEpisode) return <div className="kc-watch-error"><h1>Invalid episode</h1><p>Choose an episode from the anime page.</p><Link className="kc-btn" to={`/anime/${key}`}>Back to anime</Link></div>;
  if (details.status === 'loading' || episodes.status === 'loading') return <LoadingState label="Loading watch page" />;
  if (details.status === 'error') return <ErrorState error={details.error} onRetry={details.reload} />;
  if (episodes.status === 'error') return <ErrorState error={episodes.error} onRetry={episodes.reload} />;

  const anime = details.data;
  const current = episodes.data.items.find((episode) => episode.episodeNumber === parsedEpisode);
  const serverItems = servers.status === 'ok' ? servers.data.items : [];
  const subServers = serverItems.filter((server) => server.type === 'sub');
  const dubServers = serverItems.filter((server) => server.type === 'dub');
  const currentThumb = safeImageUrl(current?.thumbnailUrl ?? null);

  return (
    <div className="kc-watch-page">
      <div className="kc-watch-heading">
        <Link to={`/anime/${key}`} className="kc-back-link"><ArrowLeft size={15} /> {anime.title}</Link>
        <span className="kc-eyebrow">NOW VIEWING</span>
        <h1>{anime.title}</h1>
        <p>Episode {episodeNumberLabel(parsedEpisode)}{current?.title ? ` · ${current.title}` : ''}</p>
      </div>

      <div className="kc-watch-layout">
        <div className="kc-watch-main">
          <section className="kc-player-placeholder" aria-label="Video player unavailable">
            <div className="kc-player-watermark">K</div>
            <div className="kc-player-message">
              <span className="kc-player-icon"><Play size={25} fill="currentColor" /></span>
              <h2>Playback isn't connected yet</h2>
              <p>Kairo can retrieve episode information and source-server labels, but it does not currently have an authorised playback source.</p>
              <span className="kc-player-status"><ShieldAlert size={14} /> No playable source available</span>
            </div>
            <div className="kc-player-controls"><span>00:00</span><div /><span>--:--</span></div>
          </section>
          <div className="kc-watch-episode-meta">
            <div>
              <span className="kc-eyebrow">EPISODE {episodeNumberLabel(parsedEpisode)}</span>
              <h2>{current?.title || `Episode ${episodeNumberLabel(parsedEpisode)}`}</h2>
              {current && <p>{[durationLabel(current.durationSeconds), dateLabel(current.publishedAt)].filter(Boolean).join(' · ') || 'Episode information'}</p>}
            </div>
            {currentThumb && <img src={currentThumb} alt="" referrerPolicy="no-referrer" />}
          </div>
          {current?.synopsis && <p className="kc-watch-synopsis">{current.synopsis}</p>}
          <section className="kc-server-info">
            <div className="kc-section-head"><div><span className="kc-eyebrow">SOURCE DISCOVERY</span><h2>Available servers</h2></div></div>
            {servers.status === 'loading' && <LoadingState label="Checking server labels" />}
            {servers.status === 'error' && <p className="kc-hint">Server labels could not be loaded. This does not affect the episode catalogue.</p>}
            {servers.status === 'ok' && serverItems.length === 0 && <p className="kc-hint">No server labels were returned for this episode.</p>}
            {servers.status === 'ok' && serverItems.length > 0 && <div className="kc-server-groups">
              <div><b>Sub</b><span>{subServers.length ? subServers.map((server) => server.name).join(' · ') : 'Not listed'}</span></div>
              <div><b>Dub</b><span>{dubServers.length ? dubServers.map((server) => server.name).join(' · ') : 'Not listed'}</span></div>
            </div>}
            <p className="kc-hint">Server names are discovery metadata only. No stream URLs are requested or embedded.</p>
          </section>
        </div>

        <aside className="kc-watch-queue">
          <div className="kc-queue-heading"><div><span className="kc-eyebrow">UP NEXT</span><h2>Episodes</h2></div><span>{episodes.data.items.length}</span></div>
          <div className="kc-queue-list">
            {episodes.data.items.map((episode) => {
              const selected = episode.episodeNumber === parsedEpisode;
              const thumb = safeImageUrl(episode.thumbnailUrl);
              return (
                <Link key={episode.id} to={`/watch/${key}/${episode.episodeNumber}`} className={`kc-queue-item${selected ? ' active' : ''}`} aria-current={selected ? 'page' : undefined}>
                  <span className="kc-queue-number">{episodeNumberLabel(episode.episodeNumber).padStart(2, '0')}</span>
                  <span className="kc-queue-thumb">{thumb ? <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <ListVideo size={18} />}</span>
                  <span className="kc-queue-copy"><b>{episode.title || `Episode ${episode.episodeNumber}`}</b><small>{durationLabel(episode.durationSeconds) || `Episode ${episode.episodeNumber}`}</small></span>
                </Link>
              );
            })}
          </div>
          {episodes.meta.hasNextPage && <p className="kc-hint">More episodes are available on the anime details page.</p>}
        </aside>
      </div>
    </div>
  );
}
