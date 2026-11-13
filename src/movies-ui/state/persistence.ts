import type { Store } from '@reduxjs/toolkit';
import type { RootState } from './store';
import { hydrateWatchlist } from './slices/watchlistSlice';
import { hydrateLikes } from './slices/likesSlice';
import { setInteractionMode, type InteractionMode } from './slices/uiSlice';
import { hydrateAuth } from './slices/authSlice';
import { hydrateProfiles } from './slices/profileSlice';
import { hydrateSettings } from './slices/settingsSlice';
import type { TileData } from './slices/contentSlice';
import type { Account } from './slices/authSlice';
import type { Profile } from './slices/profileSlice';
import type { ProfileSettings } from './slices/settingsSlice';

const WATCHLIST_KEY = 'tvui:watchlist:v2'; // bumped from v1 (now keyed by profile)
const LEGACY_WATCHLIST_KEY = 'tvui:watchlist:v1';
const MODE_KEY = 'tvui:mode:v1';
const AUTH_KEY = 'tvui:auth:v1';
const PROFILES_KEY = 'tvui:profiles:v1';
const SETTINGS_KEY = 'tvui:settings:v1';
const LIKES_KEY = 'tvui:likes:v1';

function safeRead<T>(key: string, fallback: T, validate?: (parsed: unknown) => boolean): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (validate && !validate(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota / privacy mode — ignore
  }
}

export function loadWatchlist(): Record<string, TileData[]> {
  const v2 = safeRead<Record<string, TileData[]>>(
    WATCHLIST_KEY,
    {},
    (p) => typeof p === 'object' && p !== null && !Array.isArray(p)
  );
  if (Object.keys(v2).length > 0) return v2;
  // Migration: legacy v1 (flat array) → no profile yet, can't keyed-restore
  // Keep legacy data quarantined in localStorage; first profile creation can absorb it.
  return {};
}

export function loadLegacyFlatWatchlist(): TileData[] {
  return safeRead<TileData[]>(
    LEGACY_WATCHLIST_KEY,
    [],
    (p) => Array.isArray(p)
  );
}

export function loadMode(): InteractionMode {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (!raw) return 'web';
    // Accept both raw ('tv'/'web') and JSON-quoted ('"tv"'/'"web"') forms — older
    // builds wrote raw, newer wrote JSON. Be liberal in what we accept.
    let v = raw;
    try { v = JSON.parse(raw); } catch { /* not JSON, use raw */ }
    if (v === 'tv' || v === 'web') return v;
    return 'web';
  } catch {
    return 'web';
  }
}

interface AuthBlob {
  accounts: Account[];
  currentUserId: string | null;
}

interface ProfilesBlob {
  profiles: Profile[];
  currentProfileId: string | null;
}

interface SettingsBlob {
  byProfile: Record<string, ProfileSettings>;
}

export function loadAuth(): AuthBlob {
  return safeRead<AuthBlob>(
    AUTH_KEY,
    { accounts: [], currentUserId: null },
    (p) => typeof p === 'object' && p !== null && Array.isArray((p as AuthBlob).accounts)
  );
}

export function loadProfiles(): ProfilesBlob {
  return safeRead<ProfilesBlob>(
    PROFILES_KEY,
    { profiles: [], currentProfileId: null },
    (p) => typeof p === 'object' && p !== null && Array.isArray((p as ProfilesBlob).profiles)
  );
}

export function loadSettings(): SettingsBlob {
  return safeRead<SettingsBlob>(
    SETTINGS_KEY,
    { byProfile: {} },
    (p) => typeof p === 'object' && p !== null && typeof (p as SettingsBlob).byProfile === 'object'
  );
}

export function loadLikes(): Record<string, string[]> {
  return safeRead<Record<string, string[]>>(
    LIKES_KEY,
    {},
    (p) => typeof p === 'object' && p !== null && !Array.isArray(p)
  );
}

export function attachPersistence(store: Store<RootState>) {
  // Hydrate on boot
  store.dispatch(hydrateAuth(loadAuth()));
  store.dispatch(hydrateProfiles(loadProfiles()));
  store.dispatch(hydrateSettings(loadSettings()));
  store.dispatch(hydrateWatchlist({ byProfile: loadWatchlist() }));
  store.dispatch(hydrateLikes({ byProfile: loadLikes() }));

  const savedMode = loadMode();
  store.dispatch(setInteractionMode(savedMode));

  let lastWatchlist = store.getState().watchlist.byProfile;
  let lastLikes = store.getState().likes.byProfile;
  let lastMode = store.getState().ui.interactionMode;
  let lastAuth = store.getState().auth;
  let lastProfiles = store.getState().profile;
  let lastSettings = store.getState().settings.byProfile;

  store.subscribe(() => {
    const state = store.getState();

    if (state.watchlist.byProfile !== lastWatchlist) {
      lastWatchlist = state.watchlist.byProfile;
      safeWrite(WATCHLIST_KEY, lastWatchlist);
    }
    if (state.likes.byProfile !== lastLikes) {
      lastLikes = state.likes.byProfile;
      safeWrite(LIKES_KEY, lastLikes);
    }
    if (state.ui.interactionMode !== lastMode) {
      lastMode = state.ui.interactionMode;
      safeWrite(MODE_KEY, lastMode);
    }
    if (state.auth !== lastAuth) {
      lastAuth = state.auth;
      safeWrite(AUTH_KEY, {
        accounts: state.auth.accounts,
        currentUserId: state.auth.currentUserId,
      });
    }
    if (state.profile !== lastProfiles) {
      lastProfiles = state.profile;
      safeWrite(PROFILES_KEY, {
        profiles: state.profile.profiles,
        currentProfileId: state.profile.currentProfileId,
      });
    }
    if (state.settings.byProfile !== lastSettings) {
      lastSettings = state.settings.byProfile;
      safeWrite(SETTINGS_KEY, { byProfile: lastSettings });
    }
  });
}

/** Wipe all app data from localStorage and reload. */
export function clearAllAppData() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('tvui:')) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
  window.location.reload();
}
