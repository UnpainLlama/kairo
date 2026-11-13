import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { NavigationAction } from '../../engine/FocusEngine';

interface TrailerState {
  /** Global mute — applies to whichever trailer is active */
  trailerMuted: boolean;
  /** Global pause — stops all trailer playback */
  trailerPaused: boolean;
  /** Which trailer source is currently active */
  activeTrailer: 'hero' | 'tile' | null;
  /** Whether a tile trailer is currently playing (so hero can yield) */
  tileTrailerPlaying: boolean;
  lastNavAction: NavigationAction | null;
}

const initialState: TrailerState = {
  trailerMuted: true,
  trailerPaused: false,
  activeTrailer: null,
  tileTrailerPlaying: false,
  lastNavAction: null,
};

const trailerSlice = createSlice({
  name: 'trailer',
  initialState,
  reducers: {
    toggleTrailerMute(state) {
      state.trailerMuted = !state.trailerMuted;
    },
    setTrailerMuted(state, action: PayloadAction<boolean>) {
      state.trailerMuted = action.payload;
    },
    toggleTrailerPaused(state) {
      state.trailerPaused = !state.trailerPaused;
    },
    setTrailerPaused(state, action: PayloadAction<boolean>) {
      state.trailerPaused = action.payload;
    },
    setActiveTrailer(state, action: PayloadAction<'hero' | 'tile' | null>) {
      state.activeTrailer = action.payload;
    },
    setTileTrailerPlaying(state, action: PayloadAction<boolean>) {
      state.tileTrailerPlaying = action.payload;
    },
    setLastNavAction(state, action: PayloadAction<NavigationAction>) {
      state.lastNavAction = action.payload;
    },
  },
});

export const {
  toggleTrailerMute, setTrailerMuted,
  toggleTrailerPaused, setTrailerPaused,
  setActiveTrailer, setTileTrailerPlaying,
  setLastNavAction,
} = trailerSlice.actions;
export default trailerSlice.reducer;
