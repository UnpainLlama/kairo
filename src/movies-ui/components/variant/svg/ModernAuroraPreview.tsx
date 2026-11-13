import type { CSSProperties } from 'react';

interface Props {
  accent: string;
}

/**
 * Placeholder preview for the "Aurora" variant — two soft-blurred gradient
 * blobs slowly orbiting inside the card. Suggests a cinematic, ambient,
 * fluid feel without committing to specific UX. Replace once the variant
 * is designed.
 */
export function ModernAuroraPreview({ accent }: Props) {
  return (
    <svg
      viewBox="0 0 240 180"
      width="100%"
      height="100%"
      style={svgStyle}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="vp-aurora-a" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.85" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="vp-aurora-b" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id="vp-aurora-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* dark base */}
      <rect width="240" height="180" fill="#0c0c14" />

      {/* orbiting blobs */}
      <g filter="url(#vp-aurora-blur)">
        <circle
          cx="0"
          cy="0"
          r="70"
          fill="url(#vp-aurora-a)"
          style={{
            transformOrigin: '120px 90px',
            animation: 'vp-aurora-orbit-a 12s linear infinite',
          }}
        />
        <circle
          cx="0"
          cy="0"
          r="55"
          fill="url(#vp-aurora-b)"
          style={{
            transformOrigin: '120px 90px',
            animation: 'vp-aurora-orbit-b 16s linear infinite',
          }}
        />
      </g>

      {/* faint vignette */}
      <radialGradient id="vp-aurora-vignette" cx="50%" cy="50%" r="65%">
        <stop offset="60%" stopColor="#000" stopOpacity="0" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.65" />
      </radialGradient>
      <rect width="240" height="180" fill="url(#vp-aurora-vignette)" />
    </svg>
  );
}

const svgStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
};
