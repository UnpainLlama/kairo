import { useEffect } from 'react';
import type { PlaybackSaveReason } from '../lib/playbackSync';
import type { SavedPlayerState } from '../lib/mediaPlayback';

type Props = {
  src: string;
  title: string;
  provider: string;
  progressKey: string;
  onProgress?: (seconds: number, reason: PlaybackSaveReason, playerState?: SavedPlayerState) => void;
  playerState?: SavedPlayerState | null;
};

function readSavedSeconds(progressKey: string): number {
  try {
    const value = Number(localStorage.getItem('kairo-progress:' + progressKey) ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch { return 0; }
}

/** Anime-only external iframe. Movies use MovieEmbedPlayer and never mount this component. */
export default function AnimeEmbedPlayer({ src, title, provider, progressKey, onProgress, playerState }: Props) {
  useEffect(() => {
    const flush = (reason: 'pagehide' | 'open') => onProgress?.(readSavedSeconds(progressKey), reason, playerState ?? {});
    flush('open');
    const onPageHide = () => flush('pagehide');
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') flush('pagehide'); };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      flush('pagehide');
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [progressKey, onProgress, playerState]);

  return (
    <div className="kc-external-player kc-anime-embed-player" data-provider={provider} data-media-domain="anime">
      <iframe
        className="kc-player-frame"
        src={src}
        title={title}
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen; accelerometer; gyroscope"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <span className="kc-external-provider-label">{provider} anime player</span>
    </div>
  );
}
