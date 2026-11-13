import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface TileData {
  id: string;
  title: string;
  year: number;
  rating: string;
  genre: string;
  synopsis: string;
  imageIndex: number;
  backdropPath?: string;
  posterPath?: string;
  logoPath?: string;
  tmdbId?: number;
  mediaType?: 'movie' | 'tv';
}

export interface RowData {
  id: string;
  title: string;
  tiles: TileData[];
}

interface ContentState {
  rows: RowData[];
  pages: Record<string, RowData[]>;
  searchResults: RowData[];
}

const initialState: ContentState = {
  rows: [],
  pages: {},
  searchResults: [],
};

export const contentSlice = createSlice({
  name: 'content',
  initialState,
  reducers: {
    setContent(state, action: PayloadAction<RowData[]>) {
      state.rows = action.payload;
    },
    setPageContent(state, action: PayloadAction<{ page: string; rows: RowData[] }>) {
      state.pages[action.payload.page] = action.payload.rows;
    },
    switchPage(state, action: PayloadAction<string>) {
      const cached = state.pages[action.payload];
      if (cached) {
        state.rows = cached;
      }
    },
    setSearchResults(state, action: PayloadAction<RowData[]>) {
      state.searchResults = action.payload;
    },
  },
});

export const { setContent, setPageContent, switchPage, setSearchResults } = contentSlice.actions;
export default contentSlice.reducer;
