import { describe, expect, it } from 'vitest';
import { getWorkspaceSwitches } from './workspaceNavigation';

describe('media workspace navigation', () => {
  it('keeps both Anime and Movies accessible from the YouTube rail and mobile navigation', () => {
    expect(getWorkspaceSwitches('youtube', true)).toEqual([
      { to: '/', label: 'Anime' },
      { to: '/movies', label: 'Movies' },
    ]);
  });

  it('does not expose the admin-only YouTube workspace to standard users', () => {
    expect(getWorkspaceSwitches('anime', false)).toEqual([{ to: '/movies', label: 'Movies' }]);
    expect(getWorkspaceSwitches('movies', false)).toEqual([{ to: '/', label: 'Anime' }]);
  });

  it('offers YouTube as a workspace switch only to administrators', () => {
    expect(getWorkspaceSwitches('anime', true)).toContainEqual({ to: '/youtube', label: 'YouTube' });
    expect(getWorkspaceSwitches('movies', true)).toContainEqual({ to: '/youtube', label: 'YouTube' });
  });
});
