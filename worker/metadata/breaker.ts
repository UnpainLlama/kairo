// Per-provider circuit breaker. State lives in one Worker isolate's memory, so it is a best-effort guard, not a global limit.
// The shared cache and the 429 Retry-After handling are what actually keep KAIRO under provider limits.
export class CircuitBreaker {
  private state = new Map<string, { failures: number; openUntil: number }>();
  constructor(private threshold = 3, private cooldownMs = 60_000) {}

  canRequest(provider: string, now: number): boolean {
    const s = this.state.get(provider);
    return !s || s.openUntil <= now;
  }
  recordSuccess(provider: string): void {
    this.state.delete(provider);
  }
  recordFailure(provider: string, now: number, retryAfterSeconds?: number): void {
    const s = this.state.get(provider) ?? { failures: 0, openUntil: 0 };
    s.failures += 1;
    if (retryAfterSeconds !== undefined) s.openUntil = now + retryAfterSeconds * 1000; // a 429 opens it immediately
    else if (s.failures >= this.threshold) s.openUntil = now + this.cooldownMs;
    this.state.set(provider, s);
  }
}
