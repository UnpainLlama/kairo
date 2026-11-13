/**
 * ScrollEngine — rAF-driven animation engine.
 * Manages multiple concurrent named animations with easing/spring support.
 * Framework-agnostic: no React dependency.
 */

export interface AnimationConfig {
  from: number;
  to: number;
  duration: number;
  easing: (t: number) => number;
  onUpdate: (value: number) => void;
  onComplete?: () => void;
}

interface RunningAnimation extends AnimationConfig {
  startTime: number;
  currentValue: number;
}

class ScrollEngineImpl {
  private animations = new Map<string, RunningAnimation>();
  private rafId: number | null = null;
  private running = false;

  /**
   * Start or replace a named animation.
   * If an animation with the same key is running, interrupts from its current value.
   */
  animate(key: string, config: AnimationConfig): void {
    const existing = this.animations.get(key);

    // If already animating to the same target, skip
    if (existing && existing.to === config.to && Math.abs(existing.currentValue - config.to) < 0.5) {
      return;
    }

    // If an animation is running, start from its current value
    const from = existing ? existing.currentValue : config.from;

    // If from === to, complete immediately
    if (Math.abs(from - config.to) < 0.5) {
      config.onUpdate(config.to);
      config.onComplete?.();
      this.animations.delete(key);
      return;
    }

    this.animations.set(key, {
      ...config,
      from,
      startTime: performance.now(),
      currentValue: from,
    });

    this.ensureRunning();
  }

  /** Stop a named animation immediately. */
  stop(key: string): void {
    this.animations.delete(key);
    if (this.animations.size === 0) {
      this.stopLoop();
    }
  }

  /** Get the current interpolated value of a named animation. */
  getCurrent(key: string): number | undefined {
    return this.animations.get(key)?.currentValue;
  }

  /** Check if a named animation is in progress. */
  isAnimating(key: string): boolean {
    return this.animations.has(key);
  }

  /** Get total number of running animations. */
  getAnimationCount(): number {
    return this.animations.size;
  }

  private ensureRunning(): void {
    if (!this.running) {
      this.running = true;
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.running = false;
  }

  private tick = (now: number): void => {
    const completed: string[] = [];

    for (const [key, anim] of this.animations) {
      const elapsed = now - anim.startTime;
      const rawProgress = Math.min(elapsed / anim.duration, 1);
      const easedProgress = anim.easing(rawProgress);

      const value = anim.from + (anim.to - anim.from) * easedProgress;
      anim.currentValue = value;
      anim.onUpdate(value);

      if (rawProgress >= 1) {
        completed.push(key);
      }
    }

    // Clean up completed animations
    for (const key of completed) {
      const anim = this.animations.get(key);
      this.animations.delete(key);
      // Fire onComplete after removing from map
      anim?.onComplete?.();
    }

    if (this.animations.size > 0) {
      this.rafId = requestAnimationFrame(this.tick);
    } else {
      this.running = false;
      this.rafId = null;
    }
  };
}

/** Singleton scroll engine instance */
export const scrollEngine = new ScrollEngineImpl();
