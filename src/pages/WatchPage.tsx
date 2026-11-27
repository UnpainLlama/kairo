import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ListVideo, Play, Search, RefreshCw, ExternalLink } from 'lucide-react';
import { ErrorState, LoadingState } from '../components/catalog';
import KairoMediaPlayer, { type KairoPlaybackSource } from '../components/KairoMediaPlayer';
import { useApi } from '../lib/useApi';
import { useAccountScope } from '../hooks/useAccountScope';
import { accountPreferenceStorageKey, historyPausedStorageKey, readWatchHistory, watchProgressIdentity, watchProgressStorageKey, writeWatchHistory } from '../lib/accountStorage';
import { shouldSyncPlaybackProgress, type PlaybackSaveReason } from '../lib/playbackSync';
import { dateLabel, durationLabel, episodeNumberLabel, safeImageUrl, type AnimeDetails, type Episode, type EpisodeServer, type ItemList } from '../lib/catalog';

type ServerList = ItemList<EpisodeServer>;
type PlaybackResponse = { source: KairoPlaybackSource; urlValidated: boolean };

export default function WatchPage() {
  const { slug = '', episodeNumber: rawEpisode = '1' } = useParams();
  const key = encodeURIComponent(slug);
  const { accountId, resolved: accountResolved, error: accountError } = useAccountScope();
  const [resumeReady, setResumeReady] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [episodeFilter, setEpisodeFilter] = useState('');
  const [episodePage, setEpisodePage] = useState(1);
  const [episodePages, setEpisodePages] = useState<Episode[]>([]);
  const [autoNext, setAutoNext] = useState(true);
  const [shareStatus, setShareStatus] = useState('');
  useEffect(() => setSelectedServerId(null), [slug, rawEpisode]);
  useEffect(() => {
    try { setAutoNext(localStorage.getItem(accountPreferenceStorageKey(accountId, 'auto-next')) !== 'false'); }
    catch { setAutoNext(true); }
  }, [accountId]);
  const parsedEpisode = Number(rawEpisode);
  const validEpisode = Number.isInteger(parsedEpisode) && parsedEpisode >= 1 && parsedEpisode <= 100000;
  const details = useApi<AnimeDetails>(`/anime/${key}`);
  const episodes = useApi<ItemList<Episode>>(`/anime/${key}/episodes?page=${episodePage}&limit=50`);
  useEffect(() => { setEpisodePage(1); setEpisodePages([]); }, [slug]);
  useEffect(() => {
    if (episodes.status !== 'ok') return;
    setEpisodePages((current) => {
      const merged = new Map(current.map((item) => [item.episodeNumber, item]));
      for (const item of episodes.data.items) merged.set(item.episodeNumber, item);
      return [...merged.values()].sort((a, b) => a.episodeNumber - b.episodeNumber);
    });
    if (!episodes.data.items.some((item) => item.episodeNumber === parsedEpisode) && episodes.meta.hasNextPage && episodePage < 20) {
      setEpisodePage((page) => Math.min(page + 1, 20));
    }
  }, [episodes.status, episodePage, slug, parsedEpisode]);
  const servers = useApi<ServerList>(validEpisode ? `/anime/${key}/episodes/${parsedEpisode}/servers` : null);
  const serverItems = servers.status === 'ok' ? servers.data.items : [];
  const selectedServer = serverItems.find((server) => server.id === selectedServerId) ?? serverItems[0] ?? null;
  useEffect(() => {
    if (!selectedServer) return;
    const syncedKey = watchProgressStorageKey(accountId, slug, parsedEpisode, 'sync');
    const serverKey = watchProgressStorageKey(accountId, slug, parsedEpisode, selectedServer.id);
    try {
      const saved = localStorage.getItem(syncedKey);
      if (saved !== null) localStorage.setItem(serverKey, saved);
    } catch { /* browser storage may be unavailable */ }
  }, [accountId, slug, parsedEpisode, selectedServer?.id]);
  const playbackPath = selectedServer ? `/anime/${key}/episodes/${parsedEpisode}/servers/${encodeURIComponent(selectedServer.id)}/playback` : null;
  const playback = useApi<PlaybackResponse>(playbackPath);

  // Restore signed-in progress before the player mounts. Guest progress remains browser-only.
  useEffect(() => {
    let active = true;
    setResumeReady(false);
    if (!accountResolved || accountError) return () => { active = false; };
    if (!accountId || !validEpisode) {
      setResumeReady(true);
      return () => { active = false; };
    }

    const restore = async () => {
      try {
        const query = new URLSearchParams({ slug, episodeNumber: String(parsedEpisode) });
        const response = await fetch('/api/v1/me/history/sync?' + query.toString(), {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        const payload = response.ok ? await response.json() : null;
        if (!response.ok || !payload?.success || !Array.isArray(payload?.data?.items)) {
          throw new Error('Could not restore account playback progress.');
        }
        if (!active) return;
        const remote = payload.data.items[0] as {
          progressSeconds?: number; updatedAt?: number; durationSeconds?: number | null;
          slug?: string; episodeNumber?: number; title?: string; posterUrl?: string | null; episodeTitle?: string;
        } | undefined;
        const allLocal = readWatchHistory<Record<string, unknown> & { slug?: string; episodeNumber?: number; updatedAt?: number }>(accountId);
        const local = allLocal.find((item) => item.slug === slug && Number(item.episodeNumber) === parsedEpisode);
        let localSeconds = Number(local?.progressSeconds ?? 0);
        if (local && typeof local.progressKey === 'string') {
          const fromKey = Number(localStorage.getItem(local.progressKey) ?? 0);
          if (Number.isFinite(fromKey) && fromKey > 0) localSeconds = fromKey;
        }
        if (!local || localSeconds <= 0) {
          const syncValue = Number(localStorage.getItem(watchProgressStorageKey(accountId, slug, parsedEpisode, 'sync')) ?? 0);
          const selectedValue = selectedServer?.id
            ? Number(localStorage.getItem(watchProgressStorageKey(accountId, slug, parsedEpisode, selectedServer.id)) ?? 0)
            : 0;
          localSeconds = Math.max(Number.isFinite(syncValue) ? syncValue : 0, Number.isFinite(selectedValue) ? selectedValue : 0);
        }
        if (!Number.isFinite(localSeconds) || localSeconds < 0) localSeconds = 0;
        const remoteUpdatedAt = Number(remote?.updatedAt ?? 0);
        const serverDeleteFloor = Math.max(Number(payload.data.deletedAt ?? 0), Number(payload.data.clearedAt ?? 0), remoteUpdatedAt);
        const storedLocalUpdatedAt = Number(local?.updatedAt ?? 0);
        const localUpdatedAt = storedLocalUpdatedAt || (localSeconds > 0 && serverDeleteFloor === 0 ? Date.now() : 0);
        const localIsNewer = localSeconds > 0 && localUpdatedAt > serverDeleteFloor;
        const chosenSeconds = localIsNewer
          ? localSeconds
          : remote && Number.isFinite(Number(remote.progressSeconds)) ? Math.max(0, Number(remote.progressSeconds)) : 0;
        const chosenUpdatedAt = localIsNewer ? localUpdatedAt : remoteUpdatedAt;
        const syncKey = watchProgressStorageKey(accountId, slug, parsedEpisode, 'sync');
        const serverKey = selectedServer?.id
          ? watchProgressStorageKey(accountId, slug, parsedEpisode, selectedServer.id)
          : null;
        if (chosenSeconds <= 0 && (Number(payload.data.deletedAt ?? 0) > 0 || Number(payload.data.clearedAt ?? 0) > 0)) {
          const removedProgressKey = typeof local?.progressKey === 'string' ? local.progressKey : null;
          if (removedProgressKey) localStorage.removeItem(removedProgressKey);
          localStorage.removeItem(syncKey);
          writeWatchHistory(accountId, allLocal.filter((item) => item.slug !== slug || Number(item.episodeNumber) !== parsedEpisode));
        }
        if (chosenSeconds > 0) {
          localStorage.setItem(syncKey, String(chosenSeconds));
          if (serverKey) localStorage.setItem(serverKey, String(chosenSeconds));
          const row = {
            slug,
            title: String(remote?.title ?? local?.title ?? (details.status === 'ok' ? details.data.title : slug)),
            posterUrl: typeof remote?.posterUrl === 'string' ? remote.posterUrl : typeof local?.posterUrl === 'string' ? local.posterUrl : null,
            episodeNumber: parsedEpisode,
            episodeTitle: typeof remote?.episodeTitle === 'string' ? remote.episodeTitle : typeof local?.episodeTitle === 'string' ? local.episodeTitle : '',
            durationSeconds: Number.isFinite(Number(remote?.durationSeconds ?? local?.durationSeconds))
              ? Number(remote?.durationSeconds ?? local?.durationSeconds) : null,
            progressSeconds: chosenSeconds,
            progressKey: serverKey ?? syncKey,
            updatedAt: chosenUpdatedAt,
          };
          writeWatchHistory(accountId, [row, ...allLocal.filter((item) => item.slug !== slug || Number(item.episodeNumber) !== parsedEpisode)]);
          if (localIsNewer) {
            void fetch('/api/v1/me/history/sync', {
              method: 'POST', credentials: 'same-origin',
              headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
              body: JSON.stringify({
                items: [{
                  slug, title: row.title, posterUrl: row.posterUrl, episodeNumber: parsedEpisode,
                  episodeTitle: row.episodeTitle, durationSeconds: row.durationSeconds,
                  progressSeconds: chosenSeconds, updatedAt: chosenUpdatedAt,
                }],
                deleted: [],
              }),
            }).catch(() => { /* timestamped local progress will be retried on the next playback event */ });
          }
        }
      } catch {
        // Keep the browser copy usable; subsequent playback events retry the account write.
      } finally {
        if (active) setResumeReady(true);
      }
    };
    void restore();
    return () => { active = false; };
  }, [accountResolved, accountError, accountId, slug, parsedEpisode, selectedServer?.id, validEpisode]);

  const lastProgressSyncAt = useRef(0);
  const lastProgressSyncSeconds = useRef(-1);
  const animeForProgress = details.status === 'ok' ? details.data : null;
  const episodeForProgress = episodePages.find((episode) => episode.episodeNumber === parsedEpisode) ?? null;

  useEffect(() => {
    lastProgressSyncAt.current = 0;
    lastProgressSyncSeconds.current = -1;
  }, [accountId, slug, parsedEpisode, selectedServer?.id]);

  const persistPlaybackProgress = useCallback((seconds: number, reason: PlaybackSaveReason) => {
    if (!accountResolved || !animeForProgress || !episodeForProgress || !Number.isFinite(seconds)) return;
    const duration = Number(episodeForProgress.durationSeconds);
    const position = Math.max(0, Math.min(
      Number.isFinite(duration) && duration > 0 ? duration : 86400,
      seconds,
    ));
    if (position <= 0 && reason !== 'play') return;

    const now = Date.now();
    if (!shouldSyncPlaybackProgress(
      reason,
      lastProgressSyncAt.current,
      lastProgressSyncSeconds.current,
      position,
      now,
    )) return;

    lastProgressSyncAt.current = now;
    lastProgressSyncSeconds.current = position;

    const progressKey = watchProgressStorageKey(accountId, slug, parsedEpisode, selectedServer?.id ?? '');
    const item = {
      slug,
      title: animeForProgress.title,
      posterUrl: animeForProgress.posterUrl,
      episodeNumber: parsedEpisode,
      episodeTitle: episodeForProgress.title ?? '',
      durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
      progressSeconds: position,
      updatedAt: now,
      progressKey,
    };

    try {
      localStorage.setItem(progressKey, String(position));
      localStorage.setItem(watchProgressStorageKey(accountId, slug, parsedEpisode, 'sync'), String(position));
    } catch { /* local storage may be unavailable */ }
    const previousItems = readWatchHistory<{ slug?: string; episodeNumber?: number } & Record<string, unknown>>(accountId);
    const nextItems = [item, ...previousItems.filter((entry) =>
      entry?.slug !== slug || Number(entry?.episodeNumber) !== parsedEpisode
    )].slice(0, 100);
    writeWatchHistory(accountId, nextItems);
    window.dispatchEvent(new Event('kairo:history-change'));

    // Guests retain local progress. Signed-in viewers sync to their own D1 row.
    if (!accountId) return;
    void fetch('/api/v1/me/history/sync', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        items: [{
          slug: item.slug,
          title: item.title,
          posterUrl: item.posterUrl,
          episodeNumber: item.episodeNumber,
          episodeTitle: item.episodeTitle,
          durationSeconds: item.durationSeconds,
          progressSeconds: item.progressSeconds,
          updatedAt: item.updatedAt,
        }],
        deleted: [],
      }),
      keepalive: reason === 'pagehide',
    }).catch(() => {
      // Keep local progress; the next periodic, pause or page-exit event retries.
    });
  }, [accountResolved, accountId, animeForProgress, episodeForProgress, parsedEpisode, selectedServer?.id, slug]);

  useEffect(() => {
    if (!accountResolved || details.status !== 'ok' || episodes.status !== 'ok' || !validEpisode) return;
    try {
      if (localStorage.getItem(historyPausedStorageKey(accountId)) === 'true') return;
      const anime = details.data;
      const episode = episodePages.find((item) => item.episodeNumber === parsedEpisode);
      if (!episode) return;
      const items = readWatchHistory<{ slug?: string; episodeNumber?: number } & Record<string, unknown>>(accountId);
      const previous = items.find((item) => item?.slug === slug && Number(item?.episodeNumber) === parsedEpisode) as Record<string, unknown> | undefined;
      const entry = { slug, title: anime.title, posterUrl: anime.posterUrl, episodeNumber: parsedEpisode,
        episodeTitle: episode?.title || '', progressKey: watchProgressStorageKey(accountId, slug, parsedEpisode, selectedServer?.id ?? ''),
        durationSeconds: episode?.durationSeconds ?? null, progressSeconds: Number(previous?.progressSeconds ?? 0),
        updatedAt: Number(previous?.updatedAt ?? Date.now()) };
      const next = [entry, ...items.filter((item) => item?.slug !== slug || Number(item?.episodeNumber) !== parsedEpisode)].slice(0, 100);
      writeWatchHistory(accountId, next);
      window.dispatchEvent(new Event('kairo:history-change'));
    } catch { /* browser storage may be disabled or full */ }
  }, [accountResolved, accountId, details.status, episodes.status, episodePages, slug, parsedEpisode, selectedServer?.id, validEpisode]);

  if (!validEpisode) return <div className="kc-watch-error"><h1>Invalid episode</h1><p>Choose an episode from the anime page.</p><Link className="kc-btn kc-btn-dark" to={`/anime/${key}`}>Back to anime</Link></div>;
  if (details.status === 'loading' || (episodes.status === 'loading' && episodePages.length === 0)) return <LoadingState label="Loading episode" />;
  if (details.status === 'error') return <ErrorState error={details.error} onRetry={details.reload} />;
  if (episodes.status === 'error' && episodePages.length === 0) return <ErrorState error={episodes.error} onRetry={episodes.reload} />;

  const anime = details.data;
  const current = episodePages.find((episode) => episode.episodeNumber === parsedEpisode);
  const subServers = serverItems.filter((server) => server.type === 'sub');
  const dubServers = serverItems.filter((server) => server.type === 'dub');
  const currentThumb = safeImageUrl(current?.thumbnailUrl ?? null);
  const ordered = [...episodePages].sort((a, b) => a.episodeNumber - b.episodeNumber);
  const position = ordered.findIndex((episode) => episode.episodeNumber === parsedEpisode);
  const prev = position > 0 ? ordered[position - 1] : null;
  const next = position >= 0 && position < ordered.length - 1 ? ordered[position + 1] : null;
  const visibleEpisodes = ordered.filter((episode) => `${episode.title ?? ''} ${episode.episodeNumber}`.toLowerCase().includes(episodeFilter.toLowerCase()));
  const progressFor = (episodeNumber: number) => {
    if (!accountResolved) return 0;
    try {
      const raw = localStorage.getItem(watchProgressStorageKey(accountId, slug, episodeNumber, selectedServer?.id ?? ''));
      const seconds = raw ? Number(raw) : 0;
      const duration = ordered.find((item) => item.episodeNumber === episodeNumber)?.durationSeconds ?? 0;
      return duration > 0 && Number.isFinite(seconds) ? Math.max(0, Math.min(100, seconds / duration * 100)) : 0;
    } catch { return 0; }
  };
  const toggleAutoNext = () => setAutoNext((value) => { const nextValue = !value; try { localStorage.setItem(accountPreferenceStorageKey(accountId, 'auto-next'), String(nextValue)); } catch { /* storage may be unavailable */ } return nextValue; });
  const shareEpisode = async () => {
    setShareStatus('');
    const shareData = { title: `${anime.title} · Episode ${parsedEpisode}`, url: window.location.href };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareStatus('Share sheet opened.');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareData.url);
        setShareStatus('Episode link copied.');
      } else {
        window.prompt('Copy this episode link', shareData.url);
        setShareStatus('Use the link above to share this episode.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareStatus('Could not share automatically. Copy the page address to share this episode.');
    }
  };

  return (
    <div className="kc-watch">
      <div className="kc-watch-layout">
        <div className="kc-watch-main">
          <div className="kc-watch-topline"><Link to={`/anime/${key}`} className="kc-back-link"><ArrowLeft size={15} aria-hidden="true" /> Back to anime</Link><span className="kc-watch-breadcrumb">{anime.title} <span>/</span> Episode {episodeNumberLabel(parsedEpisode)}</span></div>

          <section className="kc-player" aria-label="Video player" key={`${slug}:${parsedEpisode}:${selectedServer?.id ?? 'none'}`}>
            {(!accountResolved || accountError || !resumeReady) && <div className="kc-player-message"><h2>{accountError ? 'Account status unavailable' : 'Loading your playback state…'}</h2><p>{accountError ? 'Retry after checking your connection. Your local data has not been opened under a guest scope.' : 'Restoring the latest progress for this account.'}</p></div>}
            {accountResolved && resumeReady && playback.status === 'ok' && (
              <KairoMediaPlayer
                source={playback.data.source}
                title={`${anime.title} · Episode ${parsedEpisode}`}
                progressKey={watchProgressIdentity(accountId, slug, parsedEpisode, selectedServer?.id ?? '')}
                introEnd={(current as (Episode & { introEndSeconds?: number | null }) | undefined)?.introEndSeconds}
                outroStart={(current as (Episode & { outroStartSeconds?: number | null }) | undefined)?.outroStartSeconds}
                nextUrl={next && autoNext ? `/watch/${key}/${next.episodeNumber}` : null}
                onProgress={persistPlaybackProgress}
              />
            )}
            {accountResolved && resumeReady && playback.status !== 'ok' && (
              <div className="kc-player-message">
                <span className="kc-player-icon"><Play size={24} fill="currentColor" aria-hidden="true" /></span>
                <h2>{playback.status === 'loading' && selectedServer ? 'Resolving stream…' : playback.status === 'error' ? 'Stream unavailable' : 'Choose a server'}</h2>
                <p>{playback.status === 'error' ? playback.error.message : selectedServer ? 'Checking that this server returns an approved playable source.' : 'No playable server is currently listed for this episode.'}</p>
              </div>
            )}
          </section>

          <div className="kc-player-toolbar">
            <div className="kc-player-toolbar-left"><span className="kc-live-dot" /> <span>{selectedServer?.name ?? 'Select a source'}</span><span className="kc-toolbar-divider" /> <span>Episode {episodeNumberLabel(parsedEpisode)}</span></div>
            <div className="kc-player-toolbar-actions">
              <button type="button" className={`kc-player-tool${autoNext ? ' is-on' : ''}`} onClick={toggleAutoNext} aria-pressed={autoNext}>Auto next: {autoNext ? 'On' : 'Off'}</button>
              <button type="button" className="kc-player-tool" onClick={() => void shareEpisode()}><ExternalLink size={14}/> Share</button>
            </div>
          </div>
          {shareStatus && <p className="kc-hint" role="status" aria-live="polite">{shareStatus}</p>}

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
            <div className="kc-section-heading"><div><span className="kc-section-kicker">PLAYBACK</span><h2>Choose a server</h2></div><span className="kc-server-count">{serverItems.length} available</span></div>
            {servers.status === 'loading' && <LoadingState label="Checking servers" />}
            {servers.status === 'error' && <div className="kc-watch-retry"><p className="kc-hint">Servers could not be loaded: {servers.error.message}</p><button type="button" className="kc-player-tool" onClick={servers.reload}><RefreshCw size={13}/> Retry</button></div>}
            {servers.status === 'ok' && serverItems.length === 0 && <p className="kc-hint">No servers are listed for this episode.</p>}
            {servers.status === 'ok' && serverItems.length > 0 && (
              <div className="kc-server-groups">
                {[['sub', 'Sub', subServers], ['hsub', 'Hard Sub', serverItems.filter((server) => server.type === 'hsub')], ['dub', 'Dub', dubServers], ['raw', 'Raw', serverItems.filter((server) => server.type === 'raw')]].map(([type, label, items]) => (
                  <div key={String(type)}><b>{String(label)}</b><span className="kc-server-options">{(items as EpisodeServer[]).length ? (items as EpisodeServer[]).map((server) => (
                    <button key={server.id} type="button" className={`kc-server-option${selectedServer?.id === server.id ? ' active' : ''}`} aria-pressed={selectedServer?.id === server.id} onClick={() => setSelectedServerId(server.id)}>{server.name}</button>
                  )) : 'Not listed'}</span></div>
                ))}
              </div>
            )}
            {playback.status === 'error' && <div className="kc-watch-retry"><p className="kc-hint" role="status">{playback.error.message}</p><button type="button" className="kc-player-tool" onClick={playback.reload}><RefreshCw size={13}/> Retry source</button></div>}
            {playback.status === 'ok' && <p className="kc-hint" role="status">URL passed Kairo’s configured HTTPS host allowlist. This does not guarantee stream uptime or confirm licensing.</p>}
          </section>
        </div>

        <aside className="kc-queue" aria-label="Episodes">
          <div className="kc-queue-head"><div><span className="kc-section-kicker">UP NEXT</span><h2>Episodes</h2></div><span>{episodePages.length}{episodes.status === 'loading' && episodePages.length > 0 ? '+' : ''}</span></div>
          <label className="kc-episode-search"><Search size={14}/><input value={episodeFilter} onChange={(event) => setEpisodeFilter(event.target.value)} placeholder="Find an episode…" aria-label="Find an episode"/></label>
          <div className="kc-queue-list">
            {visibleEpisodes.map((episode) => {
              const selected = episode.episodeNumber === parsedEpisode;
              const thumb = safeImageUrl(episode.thumbnailUrl);
              return (
                <Link key={episode.id} to={`/watch/${key}/${episode.episodeNumber}`} className={`kc-queue-item${selected ? ' active' : ''}`} aria-current={selected ? 'page' : undefined}>
                  <span className="kc-queue-thumb">{thumb ? <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <ListVideo size={16} aria-hidden="true" />}<span className="kc-ep-badge">EP {episodeNumberLabel(episode.episodeNumber)}</span>{progressFor(episode.episodeNumber) > 0 && <span className="kc-episode-progress" style={{ width: `${progressFor(episode.episodeNumber)}%` }} />}</span>
                  <span className="kc-queue-copy"><b>{episode.title || `Episode ${episodeNumberLabel(episode.episodeNumber)}`}</b><small>{progressFor(episode.episodeNumber) >= 95 ? 'Watched' : progressFor(episode.episodeNumber) > 0 ? `${Math.round(progressFor(episode.episodeNumber))}% watched` : durationLabel(episode.durationSeconds) || `Episode ${episodeNumberLabel(episode.episodeNumber)}`}</small></span>
                </Link>
              );
            })}
            {visibleEpisodes.length === 0 && <p className="kc-episode-empty">No episodes match your search.</p>}
          </div>
          {episodes.status === 'loading' && episodePages.length > 0 && <p className="kc-hint kc-queue-note">Loading more episodes…</p>}
          {episodes.status === 'ok' && episodes.meta.hasNextPage && current && <p className="kc-hint kc-queue-note">More episodes are available on the anime page.</p>}
          {episodes.status === 'ok' && episodes.meta.hasNextPage && !current && episodePage === 20 && <p className="kc-hint kc-queue-note">This episode was not found in the first 1,000 episodes.</p>}
        </aside>
      </div>
    </div>
  );
}
