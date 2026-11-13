import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { TileData } from './contentSlice';

export type PageId = 'home' | 'tvShows' | 'movies' | 'newPopular' | 'myList' | 'search' | 'settings';
export type InteractionMode = 'web' | 'tv';

interface UIState {
  interactionMode: InteractionMode;
  activePage: PageId;
  navFocused: boolean;
  navIndex: number;
  heroFocused: boolean;
  heroButtonIndex: number;
  detailOverlay: {
    open: boolean;
    tile: TileData | null;
    buttonIndex: number;
    /** Which zone of the TV detail view has focus: action buttons, season tabs, or episode list. */
    zone: 'buttons' | 'seasons' | 'episodes';
    seasonIndex: number;
    episodeIndex: number;
  };
  perfHudVisible: boolean;
  searchQuery: string;
  /** Transient hint shown when the user mouse-clicks something in TV mode that's keyboard-only. */
  tvHintVisible: boolean;
  /**
   * Re-open the variant picker on top of the app (e.g. from Settings →
   * "Switch experience"). Transient, not persisted — closes on Esc/Back or
   * after a variant is picked.
   */
  variantPickerOpen: boolean;
  /** Whether the avatar dropdown menu in the nav is currently open. Shared
   *  via redux so the perf HUD can shift out of its way. */
  profileDropdownOpen: boolean;
}

const initialState: UIState = {
  interactionMode: 'web',
  activePage: 'home',
  navFocused: false,
  navIndex: 0,
  heroFocused: false,
  heroButtonIndex: 0,
  detailOverlay: {
    open: false,
    tile: null,
    buttonIndex: 0,
    zone: 'buttons',
    seasonIndex: 0,
    episodeIndex: 0,
  },
  perfHudVisible: false,
  searchQuery: '',
  tvHintVisible: false,
  variantPickerOpen: false,
  profileDropdownOpen: false,
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    openDetail(state, action: PayloadAction<TileData>) {
      state.detailOverlay.open = true;
      state.detailOverlay.tile = action.payload;
      state.detailOverlay.buttonIndex = 0;
      state.detailOverlay.zone = 'buttons';
      state.detailOverlay.seasonIndex = 0;
      state.detailOverlay.episodeIndex = 0;
    },
    closeDetail(state) {
      state.detailOverlay.open = false;
      state.detailOverlay.tile = null;
      state.detailOverlay.buttonIndex = 0;
      state.detailOverlay.zone = 'buttons';
      state.detailOverlay.seasonIndex = 0;
      state.detailOverlay.episodeIndex = 0;
    },
    setDetailButtonIndex(state, action: PayloadAction<number>) {
      state.detailOverlay.buttonIndex = action.payload;
    },
    setDetailZone(state, action: PayloadAction<'buttons' | 'seasons' | 'episodes'>) {
      state.detailOverlay.zone = action.payload;
    },
    setDetailSeasonIndex(state, action: PayloadAction<number>) {
      state.detailOverlay.seasonIndex = action.payload;
    },
    setDetailEpisodeIndex(state, action: PayloadAction<number>) {
      state.detailOverlay.episodeIndex = action.payload;
    },
    togglePerfHud(state) {
      state.perfHudVisible = !state.perfHudVisible;
    },
    setActivePage(state, action: PayloadAction<PageId>) {
      state.activePage = action.payload;
      state.searchQuery = '';
    },
    setNavFocused(state, action: PayloadAction<boolean>) {
      state.navFocused = action.payload;
    },
    setNavIndex(state, action: PayloadAction<number>) {
      state.navIndex = action.payload;
    },
    setSearchQuery(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    appendSearchChar(state, action: PayloadAction<string>) {
      state.searchQuery += action.payload;
    },
    deleteSearchChar(state) {
      state.searchQuery = state.searchQuery.slice(0, -1);
    },
    clearSearchQuery(state) {
      state.searchQuery = '';
    },
    setHeroFocused(state, action: PayloadAction<boolean>) {
      state.heroFocused = action.payload;
      if (action.payload) {
        state.heroButtonIndex = 0;
      }
    },
    setHeroButtonIndex(state, action: PayloadAction<number>) {
      state.heroButtonIndex = action.payload;
    },
    setInteractionMode(state, action: PayloadAction<InteractionMode>) {
      state.interactionMode = action.payload;
    },
    showTvHint(state) {
      state.tvHintVisible = true;
    },
    hideTvHint(state) {
      state.tvHintVisible = false;
    },
    openVariantPicker(state) {
      state.variantPickerOpen = true;
    },
    closeVariantPicker(state) {
      state.variantPickerOpen = false;
    },
    setProfileDropdownOpen(state, action: PayloadAction<boolean>) {
      state.profileDropdownOpen = action.payload;
    },
  },
});

export const {
  openDetail, closeDetail, setDetailButtonIndex, togglePerfHud,
  setDetailZone, setDetailSeasonIndex, setDetailEpisodeIndex,
  setActivePage, setNavFocused, setNavIndex,
  setSearchQuery, appendSearchChar, deleteSearchChar, clearSearchQuery,
  setHeroFocused, setHeroButtonIndex, setInteractionMode,
  showTvHint, hideTvHint,
  openVariantPicker, closeVariantPicker,
  setProfileDropdownOpen,
} = uiSlice.actions;
export default uiSlice.reducer;
