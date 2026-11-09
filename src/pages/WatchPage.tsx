import { Link, useParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ListVideo, Play } from 'lucide-react';
import { ErrorState, LoadingState } from '../components/catalog';
import { useApi } from '../lib/useApi';
import { dateLabel, durationLabel, episodeNumberLabel, safeImageUrl, type AnimeDetails, type Episode, type EpisodeServer, type ItemList } from '../lib/catalog';

type ServerList = ItemList<EpisodeServer>;
type PlaybackSource =
  | { provider: string; protocol: 'embed'; embedUrl: string; expiresAt?: string }
  | { provider: string; protocol: 'hls'; manifestUrl: string; expiresAt?: string; subtitles: { language: string; label: string; url: string; format: 'vtt' }[]; variants: { label: string; height?: number }[] };

export default function WatchPage() {
  const { slug = '', episodeNumber: rawEpisode = '1' } = useParams();
  const key = encodeURIComponent(slug);
  const parsedEpisode = Number(rawEpisode);
  const validEpisode = Number.isInteger(parsedEpisode) && parsedEpisode >= 1 && parsedEpisode <= 100000;
  const details = useApi<AnimeDetails>(`/anime/${key}`);
  const episodes = useApi<ItemList<Episode>>(`/anime/${key}/episodes?page=1&limit=50`);
  const servers = useApi<ServerList>(validEpisode ? `/anime/${key}/episodes/${parsedEpisode}/servers` : null);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [nativeHls, setNativeHls] = useState(false);
  const [hlsChecked, setHlsChecked] = useState(false);
  useEffect(() => setSelectedServer(null), [key, parsedEpisode]);
  const playbackPath = selectedServer
    ? `/anime/${key}/episodes/${parsedEpisode}/playback?serverId=${encodeURIComponent(selectedServer)}`
    : null;
  const playback = useApi<PlaybackSource>(playbackPath);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || playback.status !== 'ok' || playback.data.protocol !== 'hls') return;
    const supported = video.canPlayType('application/vnd.apple.mpegurl') !== '';
    setNativeHls(supported);
    setHlsChecked(true);
    if (supported) video.src = playback.data.manifestUrl;
    return () => { video.pause(); video.removeAttribute('src'); video.load(); };
  }, [playback.status, playback.status === 'ok' ? playback.data.protocol : '', playback.status === 'ok' && playback.data.protocol === 'hls' ? playback.data.manifestUrl : '']);

  if (!validEpisode) return <div className="kc-watch-error"><h1>Invalid episode</h1><p>Choose an episode from the anime page.</p><Link className="kc-btn kc-btn-dark" to={`/anime/${key}`}>Back to anime</Link></div>;
  if (details.status === 'loading' || episodes.status === 'loading') return <LoadingState label="Loading episode" />;
  if (details.status === 'error') return <ErrorState error={details.error} onRetry={details.reload} />;
  if (episodes.status === 'error') return <ErrorState error={episodes.error} onRetry={episodes.reload} />;

  const anime = details.data;
  const current = episodes.data.items.find((episode) => episode.episodeNumber === parsedEpisode);
  const serverItems = servers.status === 'ok' ? servers.data.items : [];
  const subServers = serverItems.filter((server) => server.type === 'sub');
  const dubServers = serverItems.filter((server) => server.type === 'dub');
  const selected = serverItems.find((server) => server.id === selectedServer) ?? null;
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
            {selected && playback.status === 'ok' && playback.data.protocol === 'embed' ? (
              <iframe className="kc-player-frame" src={playback.data.embedUrl} title={`${anime.title} episode ${parsedEpisode} — ${selected.name}`} referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
            ) : selected && playback.status === 'ok' && playback.data.protocol === 'hls' ? (
              <div className="kc-player-hls">
                <video ref={videoRef} className="kc-player-video" controls playsInline preload="metadata" aria-label={`${anime.title} episode ${parsedEpisode}`}>
                  {playback.data.subtitles.map((track) => <track key={`${track.language}:${track.url}`} kind="subtitles" src={track.url} srcLang={track.language} label={track.label} />)}
                </video>
                {hlsChecked && !nativeHls && <div className="kc-player-message kc-player-overlay"><h2>HLS is not supported in this browser</h2><p>Try Safari or another browser with native HLS playback.</p></div>}
              </div>
            ) : (
              <div className="kc-player-message">
                <span className="kc-player-icon"><Play size={24} fill="currentColor" aria-hidden="true" /></span>
                <h2>{!selected ? 'Choose a playback server' : playback.status === 'loading' ? 'Connecting to server' : playback.status === 'error' ? 'Playback unavailable' : playback.data.protocol === 'hls' ? (nativeHls ? 'Loading HLS stream' : 'Preparing HLS stream') : 'Playback unavailable'}</h2>
                <p>{!selected ? 'Choose a Sub or Dub server below to continue.' : playback.status === 'loading' ? 'Checking for an approved playback source…' : playback.status === 'error' ? playback.error.message : playback.data.protocol === 'hls' ? 'The HLS stream is ready. Press play to start.' : 'No approved playback source was returned for this server.'}</p>
                {selected && playback.status === 'error' && <button type="button" className="kc-btn kc-btn-dark" onClick={playback.reload}>Try again</button>}
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
            {servers.status === 'error' && <p className="kc-hint">Servers could not be loaded. <button type="button" className="kc-inline-retry" onClick={servers.reload}>Retry</button></p>}
            {servers.status === 'ok' && serverItems.length === 0 && <p className="kc-hint">The provider returned no servers for this episode. <button type="button" className="kc-inline-retry" onClick={servers.reload}>Check again</button></p>}
            {servers.status === 'ok' && serverItems.length > 0 && (
              <div className="kc-server-groups">
                <div><b>Sub</b><span>{subServers.length ? subServers.map((server) => <button key={server.id} type="button" className={`kc-server-choice${selectedServer === server.id ? ' active' : ''}`} aria-pressed={selectedServer === server.id} onClick={() => setSelectedServer(server.id)}>{server.name}</button>) : 'Not listed'}</span></div>
                <div><b>Dub</b><span>{dubServers.length ? dubServers.map((server) => <button key={server.id} type="button" className={`kc-server-choice${selectedServer === server.id ? ' active' : ''}`} aria-pressed={selectedServer === server.id} onClick={() => setSelectedServer(server.id)}>{server.name}</button>) : 'Not listed'}</span></div>
              </div>
            )}
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
