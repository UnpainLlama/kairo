/** Global tile mount counter for Performance HUD */
class TileCounter {
  private count = 0;
  private listeners: Array<(count: number) => void> = [];

  mount() {
    this.count++;
    this.notify();
  }

  unmount() {
    this.count--;
    this.notify();
  }

  getCount() {
    return this.count;
  }

  onChange(cb: (count: number) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify() {
    this.listeners.forEach((cb) => cb(this.count));
  }
}

export const tileCounter = new TileCounter();
