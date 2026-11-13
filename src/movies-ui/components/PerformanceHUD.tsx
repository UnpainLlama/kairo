import { useState, useEffect, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { tileCounter } from '../utils/tileCounter';
import { scrollEngine } from '../engine/ScrollEngine';
import { hudStyles } from '../styles/componentStyles/hudStyles';
import type { RootState } from '../state/store';

// Chrome exposes a non-standard `performance.memory` field. It's the most
// useful memory signal available without a backend, and the deployment target
// (TV / Chrome) supports it.
interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

interface Metrics {
  fps: number;
  /** Worst frame interval seen in the last 1s window, in ms. */
  maxFrameMs: number;
  tileCount: number;
  animCount: number;
  domNodes: number;
  videoFrames: number;
  /** Long tasks (>50ms blocking the main thread) seen in the last 5s. */
  longTasks5s: number;
  /** JS heap used / limit, in MB. null if performance.memory is unavailable. */
  heapUsedMB: number | null;
  heapLimitMB: number | null;
}

const INITIAL_METRICS: Metrics = {
  fps: 0,
  maxFrameMs: 0,
  tileCount: 0,
  animCount: 0,
  domNodes: 0,
  videoFrames: 0,
  longTasks5s: 0,
  heapUsedMB: null,
  heapLimitMB: null,
};

/** Color a numeric metric green/yellow/red against thresholds. */
function gradeColor(value: number, good: number, warn: number, higherIsBetter = true): string {
  if (higherIsBetter) {
    if (value >= good) return '#46d369';
    if (value >= warn) return '#f5c518';
    return '#e87c7c';
  } else {
    if (value <= good) return '#46d369';
    if (value <= warn) return '#f5c518';
    return '#e87c7c';
  }
}

export function PerformanceHUD() {
  // Open by default — user can dismiss with the Hide button or the ` key.
  const [visible, setVisible] = useState(true);
  const [m, setMetrics] = useState<Metrics>(INITIAL_METRICS);
  // Slide down when the avatar dropdown is open so we don't overlap it.
  const profileDropdownOpen = useSelector((s: RootState) => s.ui.profileDropdownOpen);

  // Frame timing — record every rAF tick, keep only the last 1s of timestamps.
  const frameTimesRef = useRef<number[]>([]);
  const rafRef = useRef<number>(0);

  // Long tasks — rolling buffer of timestamps over the last 5s.
  const longTaskTimesRef = useRef<number[]>([]);

  // Toggle with backtick — keeps power-user keybinding regardless of the
  // visible Hide button.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '`') setVisible((v) => !v);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // FPS + max frame time via requestAnimationFrame.
  const measureFrame = useCallback((now: number) => {
    frameTimesRef.current.push(now);
    const cutoff = now - 1000;
    while (frameTimesRef.current.length > 0 && frameTimesRef.current[0] < cutoff) {
      frameTimesRef.current.shift();
    }
    rafRef.current = requestAnimationFrame(measureFrame);
  }, []);

  useEffect(() => {
    if (!visible) return;
    rafRef.current = requestAnimationFrame(measureFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible, measureFrame]);

  // PerformanceObserver for long tasks (Chrome/Edge support; Safari recent).
  useEffect(() => {
    if (!visible) return;
    if (typeof PerformanceObserver === 'undefined') return;
    let obs: PerformanceObserver | null = null;
    try {
      obs = new PerformanceObserver((list) => {
        const now = performance.now();
        for (const _ of list.getEntries()) {
          longTaskTimesRef.current.push(now);
        }
      });
      obs.observe({ entryTypes: ['longtask'] });
    } catch {
      // entryType not supported (Safari) — silently skip.
      obs = null;
    }
    return () => {
      if (obs) obs.disconnect();
    };
  }, [visible]);

  // Sample everything on a 500ms cadence — cheap and steady.
  useEffect(() => {
    if (!visible) return;

    const sample = () => {
      const now = performance.now();

      // FPS = frames in last 1000ms
      const frames = frameTimesRef.current;
      const fps = frames.length;

      // Max frame interval in last 1s
      let maxDelta = 0;
      for (let i = 1; i < frames.length; i++) {
        const delta = frames[i] - frames[i - 1];
        if (delta > maxDelta) maxDelta = delta;
      }

      // Long tasks in last 5s
      const longCutoff = now - 5000;
      while (longTaskTimesRef.current.length > 0 && longTaskTimesRef.current[0] < longCutoff) {
        longTaskTimesRef.current.shift();
      }
      const longTasks5s = longTaskTimesRef.current.length;

      // Heap (Chrome only)
      const mem = (performance as PerformanceWithMemory).memory;
      const heapUsedMB = mem ? Math.round(mem.usedJSHeapSize / 1048576) : null;
      const heapLimitMB = mem ? Math.round(mem.jsHeapSizeLimit / 1048576) : null;

      // DOM nodes
      const domNodes = document.getElementsByTagName('*').length;

      // Active video frames (YouTube trailer iframes)
      const videoFrames = document.querySelectorAll('iframe').length;

      setMetrics({
        fps,
        maxFrameMs: Math.round(maxDelta),
        tileCount: tileCounter.getCount(),
        animCount: scrollEngine.getAnimationCount(),
        domNodes,
        videoFrames,
        longTasks5s,
        heapUsedMB,
        heapLimitMB,
      });
    };

    sample();
    const interval = setInterval(sample, 500);
    const unsubTiles = tileCounter.onChange(() => sample());

    return () => {
      clearInterval(interval);
      unsubTiles();
    };
  }, [visible]);

  if (!visible) return null;

  const fpsColor = gradeColor(m.fps, 55, 40, true);
  const frameColor = gradeColor(m.maxFrameMs, 20, 33, false);
  const longColor = gradeColor(m.longTasks5s, 0, 2, false);
  const heapColor =
    m.heapUsedMB !== null && m.heapLimitMB !== null
      ? gradeColor(m.heapUsedMB / m.heapLimitMB, 0.5, 0.75, false)
      : 'rgba(255,255,255,0.5)';

  // Shift the HUD down by 380px when the avatar dropdown is open — that
  // covers worst-case menu height (multiple profiles + actions).
  const shiftStyle = {
    transform: profileDropdownOpen ? 'translateY(380px)' : 'translateY(0)',
    transition: 'transform 250ms cubic-bezier(0.22, 1, 0.36, 1)',
  };

  return (
    <div
      style={{ ...hudStyles.container, ...shiftStyle }}
      role="status"
      aria-label="Performance metrics"
    >
      <div style={hudStyles.header}>
        <span style={hudStyles.title}>PERF</span>
        <button
          type="button"
          style={hudStyles.hideButton}
          onClick={() => setVisible(false)}
          aria-label="Hide performance HUD"
        >
          Hide
        </button>
      </div>

      <Row label="FPS" value={String(m.fps)} color={fpsColor} />
      <Row label="Max frame" value={`${m.maxFrameMs} ms`} color={frameColor} />
      <Row label="Long tasks (5s)" value={String(m.longTasks5s)} color={longColor} />
      <Divider />
      <Row
        label="JS heap"
        value={
          m.heapUsedMB !== null && m.heapLimitMB !== null
            ? `${m.heapUsedMB} / ${m.heapLimitMB} MB`
            : 'n/a'
        }
        color={heapColor}
      />
      <Divider />
      <Row label="Tiles mounted" value={String(m.tileCount)} />
      <Row label="DOM nodes" value={String(m.domNodes)} />
      <Row label="Video frames" value={String(m.videoFrames)} />
      <Row label="Active anims" value={String(m.animCount)} />

      <div style={hudStyles.footer}>Press ` to toggle</div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={hudStyles.row}>
      <span style={hudStyles.rowLabel}>{label}</span>
      <span style={{ ...hudStyles.rowValue, color: color ?? hudStyles.rowValue.color }}>
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <div style={hudStyles.divider} />;
}
