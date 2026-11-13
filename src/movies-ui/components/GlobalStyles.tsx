import { useMode } from '../hooks/useMode';

const BASE_STYLES = `
  *, *::before, *::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  html, body, #root {
    width: 100%;
    background: #141414;
    color: #fff;
    font-family: 'Helvetica Neue', Helvetica, Arial, system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  /* Variant picker — animated SVG preview keyframes */
  @keyframes vp-classic-pulse {
    0%, 60%, 100% { transform: scale(1); }
    30%           { transform: scale(1.12); }
  }
  @keyframes vp-aurora-orbit-a {
    0%   { transform: translate(45px, 35px); }
    25%  { transform: translate(-40px, 25px); }
    50%  { transform: translate(-35px, -30px); }
    75%  { transform: translate(40px, -25px); }
    100% { transform: translate(45px, 35px); }
  }
  @keyframes vp-aurora-orbit-b {
    0%   { transform: translate(-30px, -25px); }
    25%  { transform: translate(35px, -20px); }
    50%  { transform: translate(40px, 30px); }
    75%  { transform: translate(-35px, 25px); }
    100% { transform: translate(-30px, -25px); }
  }
  @keyframes vp-lattice-pulse {
    0%, 70%, 100% { transform: scale(1); opacity: 0.85; }
    35%           { transform: scale(1.6); opacity: 1; }
  }
  @keyframes vp-lattice-line {
    0%, 80%, 100% { stroke-opacity: 0.05; }
    40%           { stroke-opacity: 0.7; }
  }
  @keyframes vp-card-shake {
    0%, 100% { transform: translateX(0) scale(1); }
    20%      { transform: translateX(-6px) scale(1.06); }
    40%      { transform: translateX(6px)  scale(1.06); }
    60%      { transform: translateX(-4px) scale(1.06); }
    80%      { transform: translateX(4px)  scale(1.06); }
  }

  /* Detail overlay (web/desktop) — smooth scale + fade entrance */
  @keyframes overlay-backdrop-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes overlay-panel-in {
    from { opacity: 0; transform: scale(0.94); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes overlay-item-in {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Content row tile entrance (web mode) — subtle staggered cascade on mount */
  @keyframes tile-in {
    from { opacity: 0; transform: translateY(8px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* Detail panel circular icon buttons (My List, Like). Hover state is
     handled in CSS so the browser tracks it natively — React-tracked hover
     is fragile when the icon swaps mid-click and the mouseleave gets dropped. */
  .detail-icon-btn {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 2px solid rgba(255,255,255,0.55);
    background: rgba(0,0,0,0.35);
    color: rgba(255,255,255,0.85);
    cursor: pointer;
    padding: 0;
    transition: background 150ms ease-out, border-color 150ms ease-out, color 150ms ease-out;
  }
  .detail-icon-btn.is-active {
    background: rgba(255,255,255,0.18);
    color: #fff;
  }
  .detail-icon-btn:hover,
  .detail-icon-btn:focus-visible {
    border-color: #fff;
    color: #fff;
    outline: none;
  }
  /* Smaller variant for trailer controls overlaid on the hero. */
  .detail-icon-btn--small {
    width: 36px;
    height: 36px;
    border-width: 1.5px;
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
    }
  }

  /* Hide scrollbars globally — scrolling still works, just no visible bar. */
  /* WebKit / Blink */
  ::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }
  /* Firefox */
  html, body, * {
    scrollbar-width: none;
  }
  /* Legacy IE/Edge */
  body {
    -ms-overflow-style: none;
  }
`;

const TV_STYLES = `
  html, body, #root {
    height: 100%;
    overflow: hidden;
    user-select: none;
    cursor: default;
  }
`;

const WEB_STYLES = `
  html, body {
    min-height: 100%;
  }
  #root {
    min-height: 100%;
  }
`;

export function GlobalStyles() {
  const mode = useMode();
  const modeStyles = mode === 'tv' ? TV_STYLES : WEB_STYLES;

  return (
    <style dangerouslySetInnerHTML={{ __html: BASE_STYLES + modeStyles }} />
  );
}
