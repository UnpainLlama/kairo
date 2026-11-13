import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface ProfileSettings {
  disableMyList: boolean;
  disableAutoplay: boolean;
  watchHistoryVisible: boolean;
  activityTracking: boolean;
}

export const DEFAULT_SETTINGS: ProfileSettings = {
  disableMyList: false,
  disableAutoplay: false,
  watchHistoryVisible: true,
  activityTracking: true,
};

interface SettingsState {
  /** Settings keyed by profileId. Each profile has its own. */
  byProfile: Record<string, ProfileSettings>;
}

const initialState: SettingsState = {
  byProfile: {},
};

export const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    hydrateSettings(state, action: PayloadAction<SettingsState>) {
      state.byProfile = action.payload.byProfile;
    },
    initProfileSettings(state, action: PayloadAction<string>) {
      // Ensure a profile has a settings entry — call when creating a profile
      if (!state.byProfile[action.payload]) {
        state.byProfile[action.payload] = { ...DEFAULT_SETTINGS };
      }
    },
    updateSetting(state, action: PayloadAction<{
      profileId: string;
      key: keyof ProfileSettings;
      value: boolean;
    }>) {
      const { profileId, key, value } = action.payload;
      if (!state.byProfile[profileId]) {
        state.byProfile[profileId] = { ...DEFAULT_SETTINGS };
      }
      state.byProfile[profileId][key] = value;
    },
    removeProfileSettings(state, action: PayloadAction<string>) {
      delete state.byProfile[action.payload];
    },
  },
});

export const {
  hydrateSettings,
  initProfileSettings,
  updateSetting,
  removeProfileSettings,
} = settingsSlice.actions;
export default settingsSlice.reducer;
