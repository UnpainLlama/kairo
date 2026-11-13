import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface LikesState {
  /** Set of liked tile IDs, keyed by profileId. */
  byProfile: Record<string, string[]>;
}

const initialState: LikesState = {
  byProfile: {},
};

export const likesSlice = createSlice({
  name: 'likes',
  initialState,
  reducers: {
    hydrateLikes(state, action: PayloadAction<{ byProfile: Record<string, string[]> }>) {
      state.byProfile = action.payload.byProfile;
    },
    toggleLike(state, action: PayloadAction<{ profileId: string; tileId: string }>) {
      const { profileId, tileId } = action.payload;
      if (!state.byProfile[profileId]) state.byProfile[profileId] = [];
      const list = state.byProfile[profileId];
      const idx = list.indexOf(tileId);
      if (idx >= 0) {
        list.splice(idx, 1);
      } else {
        list.push(tileId);
      }
    },
    removeProfileLikes(state, action: PayloadAction<string>) {
      delete state.byProfile[action.payload];
    },
  },
});

export const { hydrateLikes, toggleLike, removeProfileLikes } = likesSlice.actions;
export default likesSlice.reducer;
