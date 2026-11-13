import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface FocusState {
  rowIndex: number;
  tileIndex: number;
}

const initialState: FocusState = {
  rowIndex: 0,
  tileIndex: 0,
};

export const focusSlice = createSlice({
  name: 'focus',
  initialState,
  reducers: {
    setFocus(state, action: PayloadAction<FocusState>) {
      state.rowIndex = action.payload.rowIndex;
      state.tileIndex = action.payload.tileIndex;
    },
  },
});

export const { setFocus } = focusSlice.actions;
export default focusSlice.reducer;
