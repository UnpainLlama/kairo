import { configureStore } from '@reduxjs/toolkit';
import focusReducer from './slices/focusSlice';
import contentReducer from './slices/contentSlice';
import uiReducer from './slices/uiSlice';
import trailerReducer from './slices/trailerSlice';
import watchlistReducer from './slices/watchlistSlice';
import likesReducer from './slices/likesSlice';
import authReducer from './slices/authSlice';
import profileReducer from './slices/profileSlice';
import settingsReducer from './slices/settingsSlice';

export const store = configureStore({
  reducer: {
    focus: focusReducer,
    content: contentReducer,
    ui: uiReducer,
    trailer: trailerReducer,
    watchlist: watchlistReducer,
    likes: likesReducer,
    auth: authReducer,
    profile: profileReducer,
    settings: settingsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
