import { useCallback, useEffect, useRef, useState } from 'react';
import { Captions, Maximize, Pause, Play, Settings, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';

type Subtitle = { language: string; label: string; url: string; format: 'vtt' };
type Variant = { label: string; height?: number };
type Props = { src: string; subtitles?: Subtitle[]; variants?: Variant[]; title: string; progressKey: string; introEnd?: number | null; outroStart?: number | null; nextUrl?: string | null; previousUrl?: string | null };
const rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const stamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export default function KairoVideoPlayer({ src, subtitles = [], variants = [], title, progressKey, introEnd, outroStart, nextUrl, previousUrl }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<{ destroy: () => void; levels?: { height: number }[]; currentLevel?: number; loadSource: (url: string) => void; attachMedia: (video: HTMLVideoElement) => void; on: (event: string, cb: (...args: any[]) => void) => void; static?: { isSupported?: () => boolean }; Events?: { ERROR: string } } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [quality, setQuality] = useState('auto');
  const [availableQualities, setAvailableQualities] = useState<number[]>([]);
  const [menu, setMenu] = useState<'settings' | 'captions' | null>(null);
  const [error, setError] = useState('');
  const [buffered, setBuffered] = useState(0);
  const [showSkip, setShowSkip] = useState<'intro' | 'outro' | null>(null);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setAvailableQualities([]); setQuality('auto');
    let cancelled = false;
    setError(''); setCurrent(0); setDuration(0); setPlaying(false);
    const restore = Number(localStorage.getItem(`kairo-progress:${progressKey}`) || 0);
    const isHls = /\.m3u8(?:$|\?)/i.test(src);
    const attach = async () => {
      if (isHls && !video.canPlayType('application/vnd.apple.mpegurl')) {
        try {
          const module = await import('hls.js');
          if (cancelled) return;
          const Hls = module.default;
          if (Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true, capLevelToPlayerSize: true });
            hlsRef.current = hls as any;
            hls.attachMedia(video); hls.loadSource(src);
            hls.on(Hls.Events.MANIFEST_PARSED, () => { setAvailableQualities([...new Set<number>(hls.levels.map((level: { height: number }) => level.height).filter(Boolean))].sort((a: number, b: number) => b-a)); if (restore > 0 && restore < (video.duration || Infinity) - 15) video.currentTime = restore; window.setTimeout(selectEnglishSubtitle, 0); });
            hls.on(Hls.Events.ERROR, (_event: unknown, data: { fatal?: boolean; type?: string }) => { if (!data.fatal) return; if (data.type === 'networkError') hls.startLoad?.(); else if (data.type === 'mediaError') hls.recoverMediaError?.(); else setError('The stream encountered a playback error. Try another server.'); });
            return;
          }
        } catch { setError('HLS playback is unavailable in this browser. Try an embed server.'); return; }
      }
      video.src = src;
      const restorePosition = () => { if (restore > 0 && restore < (video.duration || Infinity) - 15) video.currentTime = restore; if (subtitles.length) { const english = subtitles.findIndex((track) => /^en(?:[-_]|$)/i.test(track.language)); if (english >= 0 && video.textTracks[english]) video.textTracks[english].mode = 'showing'; } video.removeEventListener('loadedmetadata', restorePosition); };
      video.addEventListener('loadedmetadata', restorePosition);
    };
    void attach();
    return () => { cancelled = true; hlsRef.current?.destroy(); hlsRef.current = null; video.removeAttribute('src'); video.load(); };
  }, [src, progressKey]);

  const selectEnglishSubtitle = () => { const video = videoRef.current; if (!video || !subtitles.length) return; const english = subtitles.findIndex((track) => /^en(?:[-_]|$)/i.test(track.language)); if (english >= 0 && video.textTracks[english]) video.textTracks[english].mode = 'showing'; };

  const togglePlay = useCallback(() => { const v = videoRef.current; if (!v) return; if (v.paused) void v.play().catch(() => setError('Playback was blocked. Press play to try again.')); else v.pause(); }, []);
  const seek = (delta: number) => { const v = videoRef.current; if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta)); };
  const fullscreen = () => { const el = rootRef.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.(); };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable)) return;
      if ([' ', 'k', 'K'].includes(event.key)) { event.preventDefault(); togglePlay(); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); seek(-10); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); seek(10); }
      else if (event.key.toLowerCase() === 'm') { const v = videoRef.current; if (v) v.muted = !v.muted; }
      else if (event.key.toLowerCase() === 'f') fullscreen();
      else if (event.key.toLowerCase() === 'n' && nextUrl) window.location.assign(nextUrl);
      else if (event.key.toLowerCase() === 'p' && previousUrl) window.location.assign(previousUrl);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, nextUrl, previousUrl]);

  const onTime = () => {
    const v = videoRef.current; if (!v) return;
    setCurrent(v.currentTime); setDuration(Number.isFinite(v.duration) ? v.duration : 0);
    if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    localStorage.setItem(`kairo-progress:${progressKey}`, String(v.currentTime));
    setShowSkip(introEnd && v.currentTime < introEnd && v.currentTime > 5 ? 'intro' : outroStart && v.currentTime >= outroStart ? 'outro' : null);
    setNextCountdown(nextUrl && v.duration - v.currentTime <= 15 && v.duration - v.currentTime > 0 ? Math.ceil(v.duration - v.currentTime) : null);
  };
  const changeSubtitle = (value: string) => { const v = videoRef.current; if (v) Array.from(v.textTracks).forEach((track, i) => { track.mode = value === 'off' ? 'disabled' : subtitles[i]?.url === value ? 'showing' : 'disabled'; }); };
  const setRateValue = (value: number) => { setRate(value); if (videoRef.current) videoRef.current.playbackRate = value; };
  const setQualityValue = (value: string) => { setQuality(value); const hls = hlsRef.current as any; if (hls?.levels) hls.currentLevel = value === 'auto' ? -1 : hls.levels.findIndex((level: { height: number }) => level.height === Number(value)); };
  const togglePip = async () => { const v = videoRef.current; if (!v || !('pictureInPictureEnabled' in document)) return; try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await v.requestPictureInPicture(); } catch { /* browser declined */ } };

  return <div className="kairo-video-player" ref={rootRef}>
    <video ref={videoRef} playsInline preload="metadata" onEnded={() => { if (nextUrl) window.location.assign(nextUrl); }} crossOrigin="anonymous" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={onTime} onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)} onError={() => setError('This source could not be played. Try another server.')}>
      {subtitles.map((track) => <track key={track.url} kind="subtitles" src={track.url} srcLang={track.language} label={track.label} />)}
    </video>
    {error && <div className="kairo-player-error" role="alert">{error}</div>}
    {showSkip && <button className="kairo-skip-button" onClick={() => { const v = videoRef.current; if (v) v.currentTime = showSkip === 'intro' ? (introEnd || v.currentTime) : (v.duration || v.currentTime); }}>Skip {showSkip}</button>}
    {nextCountdown !== null && <div className="kairo-next-countdown"><span>Next episode in {nextCountdown}s</span><a href={nextUrl || undefined}>Play next</a></div>}
    <div className="kairo-player-controls">
      <div className="kairo-player-progress"><div className="kairo-buffered" style={{ width: `${duration ? Math.min(100, buffered / duration * 100) : 0}%` }}/><input aria-label="Seek" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(current, duration || 0)} onChange={(e) => { if (videoRef.current) videoRef.current.currentTime = Number(e.target.value); }}/></div>
      <div className="kairo-player-control-row">
        <div className="kairo-control-group"><button aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>{playing ? <Pause/> : <Play/>}</button><button aria-label="Back 10 seconds" onClick={() => seek(-10)}><SkipBack/></button><button aria-label="Forward 10 seconds" onClick={() => seek(10)}><SkipForward/></button><button aria-label="Mute" onClick={() => { const v = videoRef.current; if (v) v.muted = !v.muted; setMuted(!videoRef.current?.muted); }}>{muted ? <VolumeX/> : <Volume2/>}</button><input aria-label="Volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => { const n = Number(e.target.value); setVolume(n); if (videoRef.current) { videoRef.current.volume = n; videoRef.current.muted = n === 0; } }}/><span className="kairo-player-time">{stamp(current)} / {stamp(duration)}</span></div>
        <div className="kairo-control-group"><button aria-label="Subtitles" onClick={() => setMenu(menu === 'captions' ? null : 'captions')}><Captions/></button><button aria-label="Settings" onClick={() => setMenu(menu === 'settings' ? null : 'settings')}><Settings/></button><button aria-label="Picture in picture" onClick={() => void togglePip()}>PiP</button><button aria-label="Fullscreen" onClick={fullscreen}><Maximize/></button></div>
      </div>
    </div>
    {menu && <div className="kairo-player-menu"><button className="kairo-menu-close" onClick={() => setMenu(null)}>×</button>{menu === 'settings' ? <><b>Playback settings</b><label>Quality<select value={quality} onChange={(e) => setQualityValue(e.target.value)}><option value="auto">Auto</option>{[...new Set([...availableQualities, ...variants.map((v) => v.height).filter(Boolean) as number[]])].sort((a,b) => b-a).map((height) => <option key={height} value={height}>{height}p</option>)}</select></label><label>Speed<select value={rate} onChange={(e) => setRateValue(Number(e.target.value))}>{rates.map((r) => <option key={r} value={r}>{r}x</option>)}</select></label></> : <><b>Subtitles</b><button onClick={() => changeSubtitle('off')}>Off</button>{subtitles.map((s) => <button key={s.url} onClick={() => changeSubtitle(s.url)}>{s.label}</button>)}</>}</div>}
    <span className="kairo-player-title">{title}</span>
  </div>;
}
