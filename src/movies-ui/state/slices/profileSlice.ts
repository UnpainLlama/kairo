import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { VariantId } from '../../data/variants';

export interface Profile {
  id: string;
  ownerId: string; // account id
  name: string;
  avatarUrl: string;
  createdAt: number;
  /**
   * Selected UI variant for this profile. Optional for backward compat —
   * existing profiles will be missing this field and hit the variant picker
   * on next entry, which is the intended migration path.
   */
  variant?: VariantId;
}

interface ProfileState {
  profiles: Profile[];
  currentProfileId: string | null;
}

const initialState: ProfileState = {
  profiles: [],
  currentProfileId: null,
};

export const profileSlice = createSlice({
  name: 'profile',
  initialState,
  reducers: {
    hydrateProfiles(state, action: PayloadAction<ProfileState>) {
      state.profiles = action.payload.profiles;
      state.currentProfileId = action.payload.currentProfileId;
    },
    createProfile: {
      reducer(state, action: PayloadAction<Profile>) {
        state.profiles.push(action.payload);
      },
      prepare(input: { ownerId: string; name: string; avatarUrl: string }) {
        const id = `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        return {
          payload: {
            id,
            ownerId: input.ownerId,
            name: input.name,
            avatarUrl: input.avatarUrl,
            createdAt: Date.now(),
          } as Profile,
        };
      },
    },
    updateProfile(state, action: PayloadAction<{ id: string; name?: string; avatarUrl?: string }>) {
      const p = state.profiles.find((x) => x.id === action.payload.id);
      if (!p) return;
      if (action.payload.name !== undefined) p.name = action.payload.name;
      if (action.payload.avatarUrl !== undefined) p.avatarUrl = action.payload.avatarUrl;
    },
    deleteProfile(state, action: PayloadAction<string>) {
      state.profiles = state.profiles.filter((p) => p.id !== action.payload);
      if (state.currentProfileId === action.payload) {
        state.currentProfileId = null;
      }
    },
    setCurrentProfile(state, action: PayloadAction<string | null>) {
      state.currentProfileId = action.payload;
    },
    setProfileVariant(state, action: PayloadAction<{ id: string; variant: VariantId }>) {
      const p = state.profiles.find((x) => x.id === action.payload.id);
      if (!p) return;
      p.variant = action.payload.variant;
    },
  },
});

export const {
  hydrateProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  setCurrentProfile,
  setProfileVariant,
} = profileSlice.actions;
export default profileSlice.reducer;
