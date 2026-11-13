import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface Account {
  id: string;
  username: string;
  profileIds: string[];
  createdAt: number;
}

interface AuthState {
  accounts: Account[];
  currentUserId: string | null;
}

const initialState: AuthState = {
  accounts: [],
  currentUserId: null,
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    hydrateAuth(state, action: PayloadAction<AuthState>) {
      state.accounts = action.payload.accounts;
      state.currentUserId = action.payload.currentUserId;
    },
    signUp: {
      reducer(state, action: PayloadAction<Account>) {
        state.accounts.push(action.payload);
        state.currentUserId = action.payload.id;
      },
      prepare(username: string) {
        const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        return {
          payload: {
            id,
            username,
            profileIds: [],
            createdAt: Date.now(),
          } as Account,
        };
      },
    },
    logIn(state, action: PayloadAction<string>) {
      // payload is account id
      const exists = state.accounts.some((a) => a.id === action.payload);
      if (exists) state.currentUserId = action.payload;
    },
    logOut(state) {
      state.currentUserId = null;
    },
    deleteAccount(state, action: PayloadAction<string>) {
      // payload is account id
      state.accounts = state.accounts.filter((a) => a.id !== action.payload);
      if (state.currentUserId === action.payload) {
        state.currentUserId = null;
      }
    },
    updateUsername(state, action: PayloadAction<{ id: string; username: string }>) {
      const acc = state.accounts.find((a) => a.id === action.payload.id);
      if (acc) acc.username = action.payload.username;
    },
    addProfileToAccount(state, action: PayloadAction<{ accountId: string; profileId: string }>) {
      const acc = state.accounts.find((a) => a.id === action.payload.accountId);
      if (acc && !acc.profileIds.includes(action.payload.profileId)) {
        acc.profileIds.push(action.payload.profileId);
      }
    },
    removeProfileFromAccount(state, action: PayloadAction<{ accountId: string; profileId: string }>) {
      const acc = state.accounts.find((a) => a.id === action.payload.accountId);
      if (acc) {
        acc.profileIds = acc.profileIds.filter((pid) => pid !== action.payload.profileId);
      }
    },
  },
});

export const {
  hydrateAuth,
  signUp,
  logIn,
  logOut,
  deleteAccount,
  updateUsername,
  addProfileToAccount,
  removeProfileFromAccount,
} = authSlice.actions;
export default authSlice.reducer;
