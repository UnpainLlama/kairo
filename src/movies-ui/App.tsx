import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Shell } from './components/Shell';
import { GlobalStyles } from './components/GlobalStyles';
import { TvHintToast } from './components/TvHintToast';
import { AuthScreen } from './components/auth/AuthScreen';
import { ProfileSelectScreen } from './components/profile/ProfileSelectScreen';
import { VariantPickerScreen } from './components/variant/VariantPickerScreen';
import { useInputNavigation } from './hooks/useInputNavigation';
import { useIsTvMode } from './hooks/useMode';
import { useCursorHide } from './hooks/useCursorHide';
import { useIsAuthenticated } from './hooks/useAuth';
import { useCurrentProfile } from './hooks/useProfile';
import { setContent, setPageContent } from './state/slices/contentSlice';
import { generateMockContent } from './data/mockContent';
import { fetchTmdbContent, fetchLogosProgressive } from './data/tmdb';
import type { RootState } from './state/store';

function TvNavigation() {
  useInputNavigation();
  return null;
}

export default function App() {
  const dispatch = useDispatch();
  const isTv = useIsTvMode();
  const isAuthed = useIsAuthenticated();
  const currentProfile = useCurrentProfile();
  const variantPickerOpen = useSelector((s: RootState) => s.ui.variantPickerOpen);
  useCursorHide();

  // Only fetch home content once a profile is selected (deferring saves API calls when on auth screens)
  useEffect(() => {
    if (!isAuthed || !currentProfile) return;
    fetchTmdbContent()
      .then((rows) => {
        if (rows.length > 0) {
          dispatch(setContent(rows));
          dispatch(setPageContent({ page: 'home', rows }));
          fetchLogosProgressive(rows, (updated) => {
            dispatch(setContent(updated));
            dispatch(setPageContent({ page: 'home', rows: updated }));
          });
        } else {
          const mock = generateMockContent();
          dispatch(setContent(mock));
          dispatch(setPageContent({ page: 'home', rows: mock }));
        }
      })
      .catch(() => {
        const mock = generateMockContent();
        dispatch(setContent(mock));
        dispatch(setPageContent({ page: 'home', rows: mock }));
      });
  }, [dispatch, isAuthed, currentProfile?.id]);

  // Show the variant picker when:
  //   - profile has no variant yet (first entry), OR
  //   - the user re-opened it from Settings → "Switch experience".
  const needsVariantPicker = !!currentProfile && (!currentProfile.variant || variantPickerOpen);

  // Decide which screen to render
  let screen;
  if (!isAuthed) {
    screen = <AuthScreen />;
  } else if (!currentProfile) {
    screen = <ProfileSelectScreen />;
  } else if (needsVariantPicker) {
    screen = <VariantPickerScreen />;
  } else {
    screen = <Shell />;
  }

  // Shell-driven inputs (and the TV hint toast) should only run when the
  // actual Shell is rendering — auth, profile select, and the variant picker
  // each have their own keyboard handling.
  const shellActive = isAuthed && !!currentProfile && !needsVariantPicker;

  return (
    <>
      <GlobalStyles />
      {isTv && shellActive && <TvNavigation />}
      {screen}
      {isTv && shellActive && <TvHintToast />}
    </>
  );
}
