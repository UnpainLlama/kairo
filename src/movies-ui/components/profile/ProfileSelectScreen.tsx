import { useState, useEffect, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { profileStyles } from '../../styles/componentStyles/profileStyles';
import { ProfileCard } from './ProfileCard';
import { ProfileForm } from './ProfileForm';
import { useProfiles } from '../../hooks/useProfile';
import { useCurrentUser } from '../../hooks/useAuth';
import { useResponsive } from '../../hooks/useResponsive';
import { useIsTvMode } from '../../hooks/useMode';
import {
  createProfile,
  updateProfile,
  deleteProfile,
  setCurrentProfile,
} from '../../state/slices/profileSlice';
import { addProfileToAccount, removeProfileFromAccount } from '../../state/slices/authSlice';
import { initProfileSettings, removeProfileSettings } from '../../state/slices/settingsSlice';
import { removeProfileWatchlist } from '../../state/slices/watchlistSlice';
import { removeProfileLikes } from '../../state/slices/likesSlice';
import type { Profile } from '../../state/slices/profileSlice';

type View = 'select' | 'create' | 'edit';

const MAX_PROFILES = 5;

export function ProfileSelectScreen() {
  const dispatch = useDispatch();
  const profiles = useProfiles();
  const user = useCurrentUser();
  const { isMobile } = useResponsive();
  const isTv = useIsTvMode();

  const [view, setView] = useState<View>('select');
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [managing, setManaging] = useState(false);

  // Pick a profile and enter the app
  const handlePickProfile = useCallback((p: Profile) => {
    if (managing) {
      setEditingProfile(p);
      setView('edit');
    } else {
      dispatch(setCurrentProfile(p.id));
    }
  }, [dispatch, managing]);

  // Create
  const handleCreate = useCallback((name: string, avatarUrl: string) => {
    if (!user) return;
    const action = createProfile({ ownerId: user.id, name, avatarUrl });
    dispatch(action);
    const newId = action.payload.id;
    dispatch(addProfileToAccount({ accountId: user.id, profileId: newId }));
    dispatch(initProfileSettings(newId));
    setView('select');
  }, [dispatch, user]);

  // Edit
  const handleSaveEdit = useCallback((name: string, avatarUrl: string) => {
    if (!editingProfile) return;
    dispatch(updateProfile({ id: editingProfile.id, name, avatarUrl }));
    setEditingProfile(null);
    setView('select');
  }, [dispatch, editingProfile]);

  // Delete
  const handleDelete = useCallback(() => {
    if (!editingProfile || !user) return;
    dispatch(deleteProfile(editingProfile.id));
    dispatch(removeProfileFromAccount({ accountId: user.id, profileId: editingProfile.id }));
    dispatch(removeProfileSettings(editingProfile.id));
    dispatch(removeProfileWatchlist(editingProfile.id));
    dispatch(removeProfileLikes(editingProfile.id));
    setEditingProfile(null);
    setView('select');
    setManaging(false);
  }, [dispatch, editingProfile, user]);

  // Cancel form
  const handleCancel = useCallback(() => {
    setEditingProfile(null);
    setView('select');
  }, []);

  // TV focus handling for select view: row of profiles + (add tile if room) + manage button
  const [focusIdx, setFocusIdx] = useState(0);

  useEffect(() => {
    setFocusIdx(0);
  }, [view, managing]);

  useEffect(() => {
    if (!isTv || view !== 'select') return;
    const handler = (e: KeyboardEvent) => {
      const tilesCount = profiles.length + (profiles.length < MAX_PROFILES ? 1 : 0);
      // Layout: row 0 = tiles (profiles + add), row 1 = manage button
      const isOnTiles = focusIdx < tilesCount;
      const isOnManage = focusIdx === tilesCount;

      if (e.key === 'ArrowLeft' || e.key === 'a') {
        e.preventDefault();
        if (isOnTiles && focusIdx > 0) setFocusIdx(focusIdx - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'd') {
        e.preventDefault();
        if (isOnTiles && focusIdx < tilesCount - 1) setFocusIdx(focusIdx + 1);
      } else if (e.key === 'ArrowDown' || e.key === 's') {
        e.preventDefault();
        if (isOnTiles) setFocusIdx(tilesCount); // jump to manage button
      } else if (e.key === 'ArrowUp' || e.key === 'w') {
        e.preventDefault();
        if (isOnManage) setFocusIdx(0);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isOnTiles) {
          if (focusIdx < profiles.length) {
            handlePickProfile(profiles[focusIdx]);
          } else {
            // Add tile
            setView('create');
          }
        } else if (isOnManage) {
          setManaging((m) => !m);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isTv, view, focusIdx, profiles, handlePickProfile]);

  const avatarSize = isMobile ? 100 : 140;

  if (view === 'create') {
    return (
      <div style={profileStyles.fullscreen}>
        <div style={profileStyles.container}>
          <ProfileForm
            mode="create"
            onSave={handleCreate}
            onCancel={handleCancel}
          />
        </div>
      </div>
    );
  }

  if (view === 'edit' && editingProfile) {
    return (
      <div style={profileStyles.fullscreen}>
        <div style={profileStyles.container}>
          <ProfileForm
            mode="edit"
            initialName={editingProfile.name}
            initialAvatarUrl={editingProfile.avatarUrl}
            onSave={handleSaveEdit}
            onDelete={handleDelete}
            onCancel={handleCancel}
          />
        </div>
      </div>
    );
  }

  // Select view
  const tilesCount = profiles.length + (profiles.length < MAX_PROFILES ? 1 : 0);

  return (
    <div style={profileStyles.fullscreen}>
      <div style={profileStyles.container}>
        <h1 style={profileStyles.heading('large')}>
          {managing ? 'Manage Profiles' : "Who's watching?"}
        </h1>

        <div style={profileStyles.profileGrid}>
          {profiles.map((p, i) => (
            <ProfileCard
              key={p.id}
              name={p.name}
              avatarUrl={p.avatarUrl}
              onClick={() => handlePickProfile(p)}
              isFocused={isTv && focusIdx === i}
              isManaging={managing}
              size={avatarSize}
            />
          ))}
          {profiles.length < MAX_PROFILES && (
            <button
              type="button"
              style={profileStyles.addTile(isTv && focusIdx === profiles.length, false)}
              onClick={() => setView('create')}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              aria-label="Add a new profile"
            >
              <div
                style={{
                  ...profileStyles.avatarCircle(avatarSize, false),
                  ...profileStyles.addCircle,
                }}
              >
                +
              </div>
              <div style={profileStyles.profileName(false)}>Add Profile</div>
            </button>
          )}
        </div>

        <button
          type="button"
          style={profileStyles.manageButton(isTv && focusIdx === tilesCount)}
          onClick={() => setManaging((m) => !m)}
        >
          {managing ? 'Done' : 'Manage Profiles'}
        </button>
      </div>
    </div>
  );
}
