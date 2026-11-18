/** Shared async request-start pacer for providers without published rate limits. */
export class Pacer {
  private next = 0;
  constructor(
    private gapMs: number,
    private now: () => number = Date.now,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}
  async wait(): Promise<void> {
    const current = this.now();
    const start = Math.max(current, this.next);
    this.next = start + this.gapMs;
    if (start > current) await this.sleep(start - current);
  }
}
