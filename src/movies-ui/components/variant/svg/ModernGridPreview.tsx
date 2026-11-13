import type { CSSProperties } from 'react';

interface Props {
  accent: string;
}

/**
 * Placeholder preview for the "Lattice" variant — a sparse grid of dots with
 * a few connecting lines that fade in and out, suggesting a graph-like
 * spatial navigation model. Replace once the variant is designed.
 */
export function ModernGridPreview({ accent }: Props) {
  // 6x4 dot grid
  const cols = 6;
  const rows = 4;
  const xStep = 240 / (cols + 1);
  const yStep = 180 / (rows + 1);

  // a few "active" dots that pulse, and lines connecting them
  const activeDots: Array<{ col: number; row: number; delay: string }> = [
    { col: 1, row: 1, delay: '0s' },
    { col: 3, row: 2, delay: '1.4s' },
    { col: 4, row: 0, delay: '2.8s' },
    { col: 2, row: 3, delay: '0.7s' },
  ];
  const lines: Array<{ from: number; to: number; delay: string }> = [
    { from: 0, to: 1, delay: '0.4s' },
    { from: 1, to: 2, delay: '1.8s' },
    { from: 1, to: 3, delay: '2.4s' },
  ];

  const dotPos = (col: number, row: number) => ({
    cx: xStep * (col + 1),
    cy: yStep * (row + 1),
  });

  return (
    <svg
      viewBox="0 0 240 180"
      width="100%"
      height="100%"
      style={svgStyle}
      aria-hidden="true"
    >
      {/* dark base with hint of accent */}
      <rect width="240" height="180" fill="#0a0e0d" />

      {/* base grid dots (dim) */}
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const { cx, cy } = dotPos(c, r);
          return (
            <circle
              key={`${r}-${c}`}
              cx={cx}
              cy={cy}
              r={2}
              fill="rgba(255,255,255,0.18)"
            />
          );
        })
      )}

      {/* connecting lines (animate opacity) */}
      {lines.map((ln, i) => {
        const a = dotPos(activeDots[ln.from].col, activeDots[ln.from].row);
        const b = dotPos(activeDots[ln.to].col, activeDots[ln.to].row);
        return (
          <line
            key={i}
            x1={a.cx}
            y1={a.cy}
            x2={b.cx}
            y2={b.cy}
            stroke={accent}
            strokeWidth={1.2}
            strokeOpacity={0.6}
            style={{
              animation: `vp-lattice-line 4s ease-in-out ${ln.delay} infinite`,
            }}
          />
        );
      })}

      {/* active dots (pulse) */}
      {activeDots.map((d, i) => {
        const { cx, cy } = dotPos(d.col, d.row);
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={3.5}
            fill={accent}
            style={{
              transformOrigin: `${cx}px ${cy}px`,
              animation: `vp-lattice-pulse 4s ease-in-out ${d.delay} infinite`,
            }}
          />
        );
      })}
    </svg>
  );
}

const svgStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
};
