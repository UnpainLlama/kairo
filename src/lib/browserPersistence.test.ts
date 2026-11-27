import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readBrowserJson, writeBrowserJson, writeBrowserText, readBrowserText, removeBrowserValue } from './browserPersistence';

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

describe('shared browser persistence helpers', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips validated JSON and falls back for malformed values', () => {
    expect(writeBrowserJson('state:v1', { items: [1, 2] })).toBe(true);
    expect(readBrowserJson('state:v1', { items: [] }, (value): value is { items: number[] } =>
      Boolean(value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items))
    )).toEqual({ items: [1, 2] });
    localStorage.setItem('bad:v1', '{broken');
    expect(readBrowserJson('bad:v1', ['fallback'])).toEqual(['fallback']);
  });

  it('handles text values and removals', () => {
    expect(writeBrowserText('token-free-pref', 'true')).toBe(true);
    expect(readBrowserText('token-free-pref')).toBe('true');
    expect(removeBrowserValue('token-free-pref')).toBe(true);
    expect(readBrowserText('token-free-pref')).toBe(null);
  });

  it('does not throw when browser storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } });
    expect(readBrowserJson('x', 7)).toBe(7);
    expect(writeBrowserJson('x', {})).toBe(false);
    expect(writeBrowserText('x', 'a')).toBe(false);
    expect(removeBrowserValue('x')).toBe(false);
  });
});
