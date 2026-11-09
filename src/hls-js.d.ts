declare module 'hls.js' {
  export default class Hls {
    static isSupported(): boolean;
    static Events: { MANIFEST_PARSED: string; ERROR: string };
    constructor(config?: Record<string, unknown>);
    attachMedia(media: HTMLMediaElement): void;
    loadSource(url: string): void;
    destroy(): void;
    on(event: string, callback: (...args: any[]) => void): void;
    levels: { height: number }[];
    currentLevel: number;
  }
}
