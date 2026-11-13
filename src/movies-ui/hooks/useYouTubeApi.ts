import { useState, useEffect } from 'react';

// Singleton state — shared across all hook instances
let apiReady = false;
let apiLoading = false;
const listeners: Array<() => void> = [];

function loadYouTubeApi(): void {
  if (apiReady || apiLoading) return;
  apiLoading = true;

  // If YT is already on window (e.g., loaded by another script)
  if (window.YT && window.YT.Player) {
    apiReady = true;
    apiLoading = false;
    listeners.forEach((cb) => cb());
    return;
  }

  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    apiReady = true;
    apiLoading = false;
    listeners.forEach((cb) => cb());
    if (prev) prev();
  };

  const script = document.createElement('script');
  script.src = 'https://www.youtube.com/iframe_api';
  script.async = true;
  document.head.appendChild(script);
}

/**
 * Hook that loads the YouTube IFrame API once and returns readiness state.
 */
export function useYouTubeApi(): { apiReady: boolean } {
  const [ready, setReady] = useState(apiReady);

  useEffect(() => {
    if (apiReady) {
      setReady(true);
      return;
    }

    const onReady = () => setReady(true);
    listeners.push(onReady);
    loadYouTubeApi();

    return () => {
      const idx = listeners.indexOf(onReady);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }, []);

  return { apiReady: ready };
}
