import type { CSSProperties } from 'react';

interface Props {
  accent: string;
}

/**
 * Animated mini-mockup of the Classic UI: three rows of rounded tiles, with
 * one tile per row pulsing on a staggered loop to suggest focus traveling
 * across the grid. Pure inline SVG + CSS keyframes (declared in GlobalStyles).
 */
export function ClassicPreview({ accent }: Props) {
  // 3 rows x 5 tiles, with one "focused" tile per row that pulses
  const rows = [
    { y: 22, focusedIdx: 1, delay: '0s' },
    { y: 70, focusedIdx: 2, delay: '1s' },
    { y: 118, focusedIdx: 3, delay: '2s' },
  ];

  return (
    <svg
      viewBox="0 0 240 180"
      width="100%"
      height="100%"
      style={svgStyle}
      aria-hidden="true"
    >
      {/* subtle nav bar */}
      <rect x="12" y="8" width="40" height="6" rx="2" fill="rgba(255,255,255,0.6)" />
      <rect x="56" y="8" width="20" height="6" rx="2" fill="rgba(255,255,255,0.25)" />
      <rect x="80" y="8" width="20" height="6" rx="2" fill="rgba(255,255,255,0.25)" />

      {rows.map((row, rIdx) => (
        <g key={rIdx}>
          {[0, 1, 2, 3, 4].map((tIdx) => {
            const x = 12 + tIdx * 44;
            const isFocused = tIdx === row.focusedIdx;
            return (
              <rect
                key={tIdx}
                x={x}
                y={row.y}
                width={40}
                height={36}
                rx={3}
                fill={isFocused ? accent : 'rgba(255,255,255,0.18)'}
                style={
                  isFocused
                    ? {
                        transformOrigin: `${x + 20}px ${row.y + 18}px`,
                        animation: `vp-classic-pulse 3s ease-in-out ${row.delay} infinite`,
                      }
                    : undefined
                }
              />
            );
          })}
        </g>
      ))}
    </svg>
  );
}

const svgStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
};
