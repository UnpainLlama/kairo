import { describe, expect, it } from 'vitest';
import { buildYouTubeSearchSuggestions, normalizeRecentYouTubeSearches } from './youtubeSearchSuggestions';

describe('buildYouTubeSearchSuggestions', () => {
  it('returns familiar topic completions for a known query', () => {
    const suggestions = buildYouTubeSearchSuggestions('minecraft');
    expect(suggestions).toContain('minecraft mods');
    expect(suggestions).toContain('minecraft with disabilities');
    expect(suggestions).toContain('minecraft 100 days');
  });

  it('places matching recent searches before curated completions', () => {
    const suggestions = buildYouTubeSearchSuggestions('mine', ['minecraft seed tour', 'music mix']);
    expect(suggestions[0]).toBe('minecraft seed tour');
    expect(suggestions).not.toContain('music mix');
  });

  it('deduplicates suggestions case-insensitively and enforces the query limit', () => {
    const suggestions = buildYouTubeSearchSuggestions('minecraft', ['Minecraft Mods', 'minecraft mods'], 4);
    expect(suggestions).toHaveLength(4);
    expect(new Set(suggestions.map(value => value.toLowerCase())).size).toBe(4);
  });

  it('normalizes and bounds saved recent searches', () => {
    expect(normalizeRecentYouTubeSearches(['  Minecraft   mods ', 'minecraft mods', '', 12, 'lofi']))
      .toEqual(['Minecraft mods', 'lofi']);
  });
});
