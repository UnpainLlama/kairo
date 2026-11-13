import type { NavigationAction } from './FocusEngine';

type ActionCallback = (action: NavigationAction) => void;
type RawKeyCallback = (key: string) => void;

const KEY_MAP: Record<string, NavigationAction> = {
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  Enter: 'SELECT',
  ' ': 'SELECT',
  Escape: 'BACK',
  Backspace: 'BACK',
  // WASD for dev convenience
  w: 'UP',
  W: 'UP',
  s: 'DOWN',
  S: 'DOWN',
  a: 'LEFT',
  A: 'LEFT',
  d: 'RIGHT',
  D: 'RIGHT',
};

const INITIAL_DELAY = 300;
const REPEAT_INTERVAL = 100;

export class InputManager {
  private callback: ActionCallback | null = null;
  private rawKeyCallback: RawKeyCallback | null = null;
  private repeatTimer: number | null = null;
  private repeatKey: string | null = null;
  private disposed = false;

  private handleKeyDown = (e: KeyboardEvent): void => {
    const action = KEY_MAP[e.key];
    // When rawKeyCallback is active (search mode), only use arrow keys/Enter/Escape for navigation
    // Let letter keys through as raw input instead of WASD navigation
    const isWasd = 'wasdWASD'.includes(e.key);
    const isBackspace = e.key === 'Backspace';
    const useAsNav = action && !(isWasd && this.rawKeyCallback) && !(isBackspace && this.rawKeyCallback);

    if (useAsNav) {
      e.preventDefault();

      // Ignore OS-level key repeat — we handle our own
      if (e.repeat) return;

      this.callback?.(action);

      // Start repeat handling for directional keys
      if (action !== 'SELECT' && action !== 'BACK') {
        this.stopRepeat();
        this.repeatKey = e.key;
        this.repeatTimer = window.setTimeout(() => {
          this.startRepeat(action);
        }, INITIAL_DELAY);
      }
    } else if (this.rawKeyCallback && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Pass printable characters and Backspace to raw key callback (for search typing)
      if (e.key.length === 1 || e.key === 'Backspace') {
        e.preventDefault();
        if (!e.repeat) {
          this.rawKeyCallback(e.key);
        }
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    if (e.key === this.repeatKey) {
      this.stopRepeat();
    }
  };

  private startRepeat(action: NavigationAction): void {
    this.repeatTimer = window.setInterval(() => {
      this.callback?.(action);
    }, REPEAT_INTERVAL);
  }

  private stopRepeat(): void {
    if (this.repeatTimer !== null) {
      clearTimeout(this.repeatTimer);
      clearInterval(this.repeatTimer);
      this.repeatTimer = null;
    }
    this.repeatKey = null;
  }

  start(callback: ActionCallback): void {
    this.callback = callback;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  setRawKeyCallback(callback: RawKeyCallback | null): void {
    this.rawKeyCallback = callback;
  }

  stop(): void {
    this.stopRepeat();
    this.callback = null;
    this.rawKeyCallback = null;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
  }
}
