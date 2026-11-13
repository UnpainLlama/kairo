import type { RootState } from './store';
import { DEFAULT_SETTINGS } from './slices/settingsSlice';

export const selectFocus = (state: RootState) => state.focus;
export const selectRows = (state: RootState) => state.content.rows;
export const selectDetailOverlay = (state: RootState) => state.ui.detailOverlay;
export const selectPerfHudVisible = (state: RootState) => state.ui.perfHudVisible;
export const selectActivePage = (state: RootState) => state.ui.activePage;
export const selectNavFocused = (state: RootState) => state.ui.navFocused;
export const selectNavIndex = (state: RootState) => state.ui.navIndex;
export const selectSearchQuery = (state: RootState) => state.ui.searchQuery;
export const selectSearchResults = (state: RootState) => state.content.searchResults;
export const selectPageCache = (state: RootState) => state.content.pages;

export const selectFocusedTile = (state: RootState) => {
  const { rowIndex, tileIndex } = state.focus;
  const row = state.content.rows[rowIndex];
  return row?.tiles[tileIndex] ?? null;
};

export const selectTrailerMuted = (state: RootState) => state.trailer.trailerMuted;
export const selectTrailerPaused = (state: RootState) => state.trailer.trailerPaused;
export const selectLastNavAction = (state: RootState) => state.trailer.lastNavAction;
export const selectActiveTrailer = (state: RootState) => state.trailer.activeTrailer;
export const selectTileTrailerPlaying = (state: RootState) => state.trailer.tileTrailerPlaying;
export const selectHeroFocused = (state: RootState) => state.ui.heroFocused;
export const selectHeroButtonIndex = (state: RootState) => state.ui.heroButtonIndex;

export const selectInteractionMode = (state: RootState) => state.ui.interactionMode;

// --- Auth ---
export const selectAccounts = (state: RootState) => state.auth.accounts;
export const selectCurrentUserId = (state: RootState) => state.auth.currentUserId;
export const selectCurrentUser = (state: RootState) => {
  const id = state.auth.currentUserId;
  if (!id) return null;
  return state.auth.accounts.find((a) => a.id === id) ?? null;
};
export const selectIsAuthenticated = (state: RootState) => state.auth.currentUserId !== null;

// --- Profile ---
export const selectProfiles = (state: RootState) => state.profile.profiles;
export const selectCurrentProfileId = (state: RootState) => state.profile.currentProfileId;
export const selectCurrentProfile = (state: RootState) => {
  const id = state.profile.currentProfileId;
  if (!id) return null;
  return state.profile.profiles.find((p) => p.id === id) ?? null;
};
export const selectProfilesForCurrentUser = (state: RootState) => {
  const userId = state.auth.currentUserId;
  if (!userId) return [];
  return state.profile.profiles.filter((p) => p.ownerId === userId);
};

// --- Settings ---
export const selectCurrentSettings = (state: RootState) => {
  const profileId = state.profile.currentProfileId;
  if (!profileId) return DEFAULT_SETTINGS;
  return state.settings.byProfile[profileId] ?? DEFAULT_SETTINGS;
};
export const selectAllSettings = (state: RootState) => state.settings.byProfile;

// --- Watchlist (per-profile) ---
export const selectWatchlist = (state: RootState) => {
  const profileId = state.profile.currentProfileId;
  if (!profileId) return [];
  return state.watchlist.byProfile[profileId] ?? [];
};
export const selectIsInWatchlist = (id: string) => (state: RootState) => {
  const profileId = state.profile.currentProfileId;
  if (!profileId) return false;
  const list = state.watchlist.byProfile[profileId] ?? [];
  return list.some((t) => t.id === id);
};
export const selectAllWatchlists = (state: RootState) => state.watchlist.byProfile;

// --- Likes (per-profile) ---
export const selectIsLiked = (id: string) => (state: RootState) => {
  const profileId = state.profile.currentProfileId;
  if (!profileId) return false;
  const list = state.likes.byProfile[profileId] ?? [];
  return list.includes(id);
};
