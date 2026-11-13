import { Provider } from 'react-redux';
import MoviesApp from './App';
import { attachPersistence } from './state/persistence';
import { store } from './state/store';
import { signUp, addProfileToAccount } from './state/slices/authSlice';
import { createProfile, setCurrentProfile } from './state/slices/profileSlice';
import { initProfileSettings } from './state/slices/settingsSlice';

let initialized = false;

function initializeMoviesUi() {
  if (initialized || typeof window === 'undefined') return;
  attachPersistence(store);

  let state = store.getState();
  let userId = state.auth.currentUserId;

  // The source UI has a local profile model. Bootstrap a personal profile once,
  // without creating or changing a Kairo server account.
  if (!userId && state.auth.accounts.length === 0) {
    const account = store.dispatch(signUp('Movies'));
    userId = account.payload.id;
  }

  if (userId) {
    state = store.getState();
    let profile = state.profile.profiles.find((item) => item.ownerId === userId);
    if (!profile) {
      const created = store.dispatch(createProfile({
        ownerId: userId,
        name: 'Movies',
        avatarUrl: '',
      }));
      profile = created.payload;
      store.dispatch(addProfileToAccount({ accountId: userId, profileId: profile.id }));
      store.dispatch(initProfileSettings(profile.id));
    }
    if (!store.getState().profile.currentProfileId) {
      store.dispatch(setCurrentProfile(profile.id));
    }
  }

  initialized = true;
}

export function MoviesWorkspace() {
  initializeMoviesUi();
  return (
    <div className="movies-tv-ui">
      <Provider store={store}>
        <MoviesApp />
      </Provider>
    </div>
  );
}
