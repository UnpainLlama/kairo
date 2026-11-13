/**
 * Easing functions for scroll animations.
 * Each function takes t (0-1 progress) and returns interpolated value (0-1).
 */

/** Standard ease-out (cubic): fast start, gentle stop. */
export function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Gentle ease-out (quintic): very smooth deceleration, great for scroll. */
export function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

/** Smooth ease-out (quartic): between cubic and quintic. */
export function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

/** Standard ease-in-out: smooth start and stop. */
export function easeInOut(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Gentle ease-in-out (quintic): very smooth start and stop. */
export function easeInOutQuint(t: number): number {
  return t < 0.5
    ? 16 * t * t * t * t * t
    : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

/** Linear interpolation — no easing. */
export function linear(t: number): number {
  return t;
}

/**
 * Creates a spring easing function using a critically-damped spring model.
 * Returns a function that maps progress (0-1) to displacement (0-1) with overshoot.
 *
 * @param stiffness — spring stiffness (higher = faster). Default 300.
 * @param damping — damping ratio (higher = less bounce). Default 26.
 *   - damping < 2*sqrt(stiffness) → underdamped (bouncy)
 *   - damping = 2*sqrt(stiffness) → critically damped (no bounce, fastest settle)
 *   - damping > 2*sqrt(stiffness) → overdamped (slow settle)
 */
export function spring(stiffness = 300, damping = 26): (t: number) => number {
  // Pre-compute spring parameters
  const mass = 1;
  const omega0 = Math.sqrt(stiffness / mass); // natural frequency
  const zeta = damping / (2 * Math.sqrt(stiffness * mass)); // damping ratio

  // Duration estimation: find when displacement is < 0.001 from target
  // We compute at many points and find the max t where |x-1| > 0.001
  const sampleCount = 200;
  const maxTime = 2; // seconds — generous upper bound

  // Build a lookup table for the spring response
  const samples: number[] = [];
  for (let i = 0; i <= sampleCount; i++) {
    const t = (i / sampleCount) * maxTime;
    let x: number;

    if (zeta < 1) {
      // Underdamped
      const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
      x = 1 - Math.exp(-zeta * omega0 * t) * (
        Math.cos(omegaD * t) + (zeta * omega0 / omegaD) * Math.sin(omegaD * t)
      );
    } else if (zeta === 1) {
      // Critically damped
      x = 1 - (1 + omega0 * t) * Math.exp(-omega0 * t);
    } else {
      // Overdamped
      const s1 = -omega0 * (zeta + Math.sqrt(zeta * zeta - 1));
      const s2 = -omega0 * (zeta - Math.sqrt(zeta * zeta - 1));
      const c2 = -s1 / (s2 - s1);
      const c1 = 1 - c2;
      x = 1 - c1 * Math.exp(s1 * t) - c2 * Math.exp(s2 * t);
    }

    samples.push(x);
  }

  // Find effective duration (when spring settles within 0.001 of target)
  let effectiveSamples = sampleCount;
  for (let i = sampleCount; i >= 0; i--) {
    if (Math.abs(samples[i] - 1) > 0.001) {
      effectiveSamples = Math.min(sampleCount, i + 5); // add a few frames margin
      break;
    }
  }

  return (progress: number): number => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;

    // Map input progress [0, 1] to our effective sample range
    const idx = progress * effectiveSamples;
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, sampleCount);
    const frac = idx - lo;

    // Linear interpolation between samples
    return samples[lo] + (samples[hi] - samples[lo]) * frac;
  };
}
