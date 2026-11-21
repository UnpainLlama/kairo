export type WorkspaceMode = 'anime' | 'movies' | 'youtube';
export type WorkspaceSwitch = { to: string; label: 'Anime' | 'Movies' | 'YouTube' };

export function getWorkspaceSwitches(mode: WorkspaceMode, isAdmin: boolean): WorkspaceSwitch[] {
  if (mode === 'youtube') return [{ to: '/', label: 'Anime' }, { to: '/movies', label: 'Movies' }];
  if (mode === 'movies') return [{ to: '/', label: 'Anime' }, ...(isAdmin ? [{ to: '/youtube', label: 'YouTube' as const }] : [])];
  return [{ to: '/movies', label: 'Movies' }, ...(isAdmin ? [{ to: '/youtube', label: 'YouTube' as const }] : [])];
}
