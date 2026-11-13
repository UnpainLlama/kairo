import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { TileData } from './contentSlice';

interface WatchlistState {
  /** Watchlist items keyed by profileId. */
  byProfile: Record<string, TileData[]>;
}

const initialState: WatchlistState = {
  byProfile: {},
};

export const watchlistSlice = createSlice({
  name: 'watchlist',
  initialState,
  reducers: {
    hydrateWatchlist(state, action: PayloadAction<{ byProfile: Record<string, TileData[]> }>) {
      state.byProfile = action.payload.byProfile;
    },
    toggleWatchlist(state, action: PayloadAction<{ profileId: string; tile: TileData }>) {
      const { profileId, tile } = action.payload;
      if (!state.byProfile[profileId]) state.byProfile[profileId] = [];
      const list = state.byProfile[profileId];
      const idx = list.findIndex((t) => t.id === tile.id);
      if (idx >= 0) {
        list.splice(idx, 1);
      } else {
        list.unshift(tile);
      }
    },
    clearWatchlist(state, action: PayloadAction<string>) {
      // payload is profileId
      state.byProfile[action.payload] = [];
    },
    removeProfileWatchlist(state, action: PayloadAction<string>) {
      delete state.byProfile[action.payload];
    },
  },
});

export const {
  hydrateWatchlist,
  toggleWatchlist,
  clearWatchlist,
  removeProfileWatchlist,
} = watchlistSlice.actions;
export default watchlistSlice.reducer;
