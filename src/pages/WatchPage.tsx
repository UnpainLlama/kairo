import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ListVideo, Play } from 'lucide-react';
import { ErrorState, LoadingState } from '../components/catalog';
import { useApi } from '../lib/useApi';
import { dateLabel, durationLabel, episodeNumberLabel, safeImageUrl, type AnimeDetails, type Episode, type EpisodeServer, type ItemList } from '../lib/catalog';

type ServerList = ItemList<EpisodeServer>;
type PlaybackSource =
  | { provider: string; protocol: 'hls'; manifestUrl: string; subtitles?: { language: string; label: string; url: string; format: 'vtt' }[]; variants?: { label: string; height?: number }[] }
  | { provider: string; protocol: 'embed'; embedUrl: string };
type PlaybackResponse = { source: PlaybackSource; urlValidated: boolean };

export default function WatchPage() {
  const { slug = '', episodeNumber: rawEpisode = '1' } = useParams();
  const key = encodeURIComponent(slug);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  useEffect(() => setSelectedServerId(null), [slug, rawEpisode]);
  const parsedEpisode = Number(rawEpisode);
  const validEpisode = Number.isInteger(parsedEpisode) && parsedEpisode >= 1 && parsedEpisode <= 100000;
  const details = useApi<AnimeDetails>(`/anime/${key}`);
  const episodes = useApi<ItemList<Episode>>(`/anime/${key}/episodes?page=1&limit=50`);
  const servers = useApi<ServerList>(validEpisode ? `/anime/${key}/episodes/${parsedEpisode}/servers` : null);
  const serverItems = servers.status === 'ok' ? servers.data.items : [];
  const selectedServer = serverItems.find((server) => server.id === selectedServerId) ?? serverItems[0] ?? null;
  const playbackPath = selectedServer ? `/anime/${key}/episodes/${parsedEpisode}/servers/${encodeURIComponent(selectedServer.id)}/playback` : null;
  const playback = useApi<PlaybackResponse>(playbackPath);

  if (!validEpisode) return <div className="kc-watch-error"><h1>Invalid episode</h1><p>Choose an episode from the anime page.</p><Link className="kc-btn kc-btn-dark" to={`/anime/${key}`}>Back to anime</Link></div>;
  if (details.status === 'loading' || episodes.status === 'loading') return <LoadingState label="Loading episode" />;
  if (details.status === 'error') return <ErrorState error={details.error} onRetry={details.reload} />;
  if (episodes.status === 'error') return <ErrorState error={episodes.error} onRetry={episodes.reload} />;

  const anime = details.data;
  const current = episodes.data.items.find((episode) => episode.episodeNumber === parsedEpisode);
  const subServers = serverItems.filter((server) => server.type === 'sub');
  const dubServers = serverItems.filter((server) => server.type === 'dub');
  const currentThumb = safeImageUrl(current?.thumbnailUrl ?? null);
  const ordered = [...episodes.data.items].sort((a, b) => a.episodeNumber - b.episodeNumber);
  const position = ordered.findIndex((episode) => episode.episodeNumber === parsedEpisode);
  const prev = position > 0 ? ordered[position - 1] : null;
  const next = position >= 0 && position < ordered.length - 1 ? ordered[position + 1] : null;

  return (
    <div className="kc-watch">
      <div className="kc-watch-layout">
        <div className="kc-watch-main">
          <Link to={`/anime/${key}`} className="kc-back-link"><ArrowLeft size={15} aria-hidden="true" /> {anime.title}</Link>

          <section className="kc-player" aria-label="Video player">
            {playback.status === 'ok' && playback.data.source.protocol === 'embed' && (
              <iframe className="kc-player-frame" src={playback.data.source.embedUrl} title={`${anime.title} episode ${parsedEpisode} player`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="no-referrer" />
            )}
            {playback.status === 'ok' && playback.data.source.protocol === 'hls' && (
              <video className="kc-player-video" src={playback.data.source.manifestUrl} controls playsInline preload="metadata" crossOrigin="anonymous">
                Your browser cannot play this HLS stream natively. Try an approved embed server if available.
              </video>
            )}
            {playback.status !== 'ok' && (
              <div className="kc-player-message">
                <span className="kc-player-icon"><Play size={24} fill="currentColor" aria-hidden="true" /></span>
                <h2>{playback.status === 'loading' && selectedServer ? 'Resolving stream…' : playback.status === 'error' ? 'Stream unavailable' : 'Choose a server'}</h2>
                <p>{playback.status === 'error' ? playback.error.message : selectedServer ? 'Checking that this server returns an approved playable source.' : 'No playable server is currently listed for this episode.'}</p>
              </div>
            )}
          </section>

          <div className="kc-watch-bar">
            <div>
              <h1>{current?.title || `Episode ${episodeNumberLabel(parsedEpisode)}`}</h1>
              <p>Episode {episodeNumberLabel(parsedEpisode)}{current ? ` · ${[durationLabel(current.durationSeconds), dateLabel(current.publishedAt)].filter(Boolean).join(' · ') || anime.title}` : ` · ${anime.title}`}</p>
            </div>
            <div className="kc-watch-step">
              {prev ? <Link className="kc-btn kc-btn-dark" to={`/watch/${key}/${prev.episodeNumber}`}>Previous</Link> : <span className="kc-btn kc-btn-dark" aria-disabled="true">Previous</span>}
              {next ? <Link className="kc-btn kc-btn-primary" to={`/watch/${key}/${next.episodeNumber}`}>Next</Link> : <span className="kc-btn kc-btn-primary" aria-disabled="true">Next</span>}
            </div>
          </div>

          {(current?.synopsis || currentThumb) && (
            <div className="kc-watch-about">
              {currentThumb && <img src={currentThumb} alt="" referrerPolicy="no-referrer" />}
              {current?.synopsis && <p>{current.synopsis}</p>}
            </div>
          )}

          <section className="kc-servers" aria-label="Servers">
            <h2>Servers</h2>
            {servers.status === 'loading' && <LoadingState label="Checking servers" />}
            {servers.status === 'error' && <p className="kc-hint">Servers could not be loaded.</p>}
            {servers.status === 'ok' && serverItems.length === 0 && <p className="kc-hint">No servers are listed for this episode.</p>}
            {servers.status === 'ok' && serverItems.length > 0 && (
              <div className="kc-server-groups">
                {[['sub', 'Sub', subServers], ['dub', 'Dub', dubServers], ['raw', 'Raw', serverItems.filter((server) => server.type === 'raw')]].map(([type, label, items]) => (
                  <div key={String(type)}><b>{String(label)}</b><span className="kc-server-options">{(items as EpisodeServer[]).length ? (items as EpisodeServer[]).map((server) => (
                    <button key={server.id} type="button" className={`kc-server-option${selectedServer?.id === server.id ? ' active' : ''}`} aria-pressed={selectedServer?.id === server.id} onClick={() => setSelectedServerId(server.id)}>{server.name}</button>
                  )) : 'Not listed'}</span></div>
                ))}
              </div>
            )}
            {playback.status === 'error' && <p className="kc-hint" role="status">{playback.error.message}</p>}
            {playback.status === 'ok' && <p className="kc-hint" role="status">URL passed Kairo’s configured HTTPS host allowlist. This does not guarantee stream uptime or confirm licensing.</p>}
          </section>
        </div>

        <aside className="kc-queue" aria-label="Episodes">
          <div className="kc-queue-head"><h2>Episodes</h2><span>{episodes.data.items.length}</span></div>
          <div className="kc-queue-list">
            {ordered.map((episode) => {
              const selected = episode.episodeNumber === parsedEpisode;
              const thumb = safeImageUrl(episode.thumbnailUrl);
              return (
                <Link key={episode.id} to={`/watch/${key}/${episode.episodeNumber}`} className={`kc-queue-item${selected ? ' active' : ''}`} aria-current={selected ? 'page' : undefined}>
                  <span className="kc-queue-thumb">{thumb ? <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <ListVideo size={16} aria-hidden="true" />}<span className="kc-ep-badge">EP {episodeNumberLabel(episode.episodeNumber)}</span></span>
                  <span className="kc-queue-copy"><b>{episode.title || `Episode ${episodeNumberLabel(episode.episodeNumber)}`}</b><small>{durationLabel(episode.durationSeconds) || `Episode ${episodeNumberLabel(episode.episodeNumber)}`}</small></span>
                </Link>
              );
            })}
          </div>
          {episodes.meta.hasNextPage && <p className="kc-hint kc-queue-note">More episodes are listed on the anime page.</p>}
        </aside>
      </div>
    </div>
  );
}
