import { useState, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { settingsStyles } from '../../styles/componentStyles/settingsStyles';
import { SettingsToggle } from './SettingsToggle';
import { useResponsive } from '../../hooks/useResponsive';
import { useCurrentProfile } from '../../hooks/useProfile';
import { useCurrentUser } from '../../hooks/useAuth';
import { useSettings } from '../../hooks/useSettings';
import { updateSetting } from '../../state/slices/settingsSlice';
import { updateUsername, deleteAccount, logOut } from '../../state/slices/authSlice';
import { setCurrentProfile } from '../../state/slices/profileSlice';
import { setActivePage, openVariantPicker } from '../../state/slices/uiSlice';
import { useCurrentVariant } from '../../hooks/useCurrentVariant';
import {
  selectAccounts,
  selectAllSettings,
  selectAllWatchlists,
  selectProfilesForCurrentUser,
} from '../../state/selectors';

type Section = 'profile' | 'playback' | 'privacy' | 'account';

const SECTION_META: { id: Section; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'playback', label: 'Playback' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'account', label: 'Account' },
];

export function SettingsPage() {
  const dispatch = useDispatch();
  const { isMobile } = useResponsive();
  const profile = useCurrentProfile();
  const user = useCurrentUser();
  const settings = useSettings();
  const currentVariant = useCurrentVariant();
  const accounts = useSelector(selectAccounts);
  const allSettings = useSelector(selectAllSettings);
  const allWatchlists = useSelector(selectAllWatchlists);
  const profiles = useSelector(selectProfilesForCurrentUser);

  const [activeSection, setActiveSection] = useState<Section>('profile');
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState(user?.username ?? '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [exportBanner, setExportBanner] = useState<string | null>(null);

  const handleToggle = useCallback((key: 'disableMyList' | 'disableAutoplay' | 'watchHistoryVisible' | 'activityTracking') => (value: boolean) => {
    if (!profile) return;
    dispatch(updateSetting({ profileId: profile.id, key, value }));
  }, [dispatch, profile]);

  const handleSaveUsername = useCallback(() => {
    if (!user) return;
    const trimmed = usernameDraft.trim();
    if (!trimmed) return;
    if (trimmed === user.username) {
      setEditingUsername(false);
      return;
    }
    if (accounts.some((a) => a.id !== user.id && a.username.toLowerCase() === trimmed.toLowerCase())) {
      return; // ignore conflict silently for now
    }
    dispatch(updateUsername({ id: user.id, username: trimmed }));
    setEditingUsername(false);
  }, [dispatch, usernameDraft, user, accounts]);

  const handleDeleteAccount = useCallback(() => {
    if (!user) return;
    dispatch(deleteAccount(user.id));
    dispatch(setCurrentProfile(null));
    dispatch(logOut());
  }, [dispatch, user]);

  const handleExport = useCallback(() => {
    if (!user || !profile) return;
    const payload = {
      account: { id: user.id, username: user.username, createdAt: user.createdAt },
      profiles: profiles.map((p) => ({
        id: p.id,
        name: p.name,
        avatarUrl: p.avatarUrl,
        settings: allSettings[p.id] ?? null,
        watchlistCount: (allWatchlists[p.id] ?? []).length,
      })),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jflix-export-${user.username}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportBanner('Exported. Check your downloads.');
    setTimeout(() => setExportBanner(null), 3000);
  }, [user, profile, profiles, allSettings, allWatchlists]);

  const sections = useMemo(() => ({
    profile: (
      <div style={settingsStyles.section}>
        <h2 style={settingsStyles.sectionHeader}>Profile</h2>
        <div style={settingsStyles.row(false)}>
          <div>
            <div style={settingsStyles.rowLabel}>Profile name</div>
            <div style={settingsStyles.rowDescription}>{profile?.name}</div>
          </div>
          <button
            type="button"
            style={settingsStyles.rowButton('secondary')}
            onClick={() => {
              dispatch(setCurrentProfile(null));
              dispatch(setActivePage('home'));
            }}
          >
            Edit profile
          </button>
        </div>
        <div style={settingsStyles.row(false)}>
          <div>
            <div style={settingsStyles.rowLabel}>Streaming experience</div>
            <div style={settingsStyles.rowDescription}>
              Currently: {currentVariant?.name ?? 'Not set'}
            </div>
          </div>
          <button
            type="button"
            style={settingsStyles.rowButton('secondary')}
            onClick={() => dispatch(openVariantPicker())}
          >
            Switch experience
          </button>
        </div>
      </div>
    ),

    playback: (
      <div style={settingsStyles.section}>
        <h2 style={settingsStyles.sectionHeader}>Playback</h2>
        <SettingsToggle
          label="Disable autoplay trailers"
          description="Skip auto-playing trailers on tile focus, hero, and detail view."
          isOn={settings.disableAutoplay}
          onChange={handleToggle('disableAutoplay')}
        />
        <SettingsToggle
          label="Disable My List"
          description="Hide the My List nav item and disable adding titles to your list."
          isOn={settings.disableMyList}
          onChange={handleToggle('disableMyList')}
        />
      </div>
    ),

    privacy: (
      <div style={settingsStyles.section}>
        <h2 style={settingsStyles.sectionHeader}>Privacy</h2>
        <SettingsToggle
          label="Watch history visible"
          description="Show watch history on this profile. Disable to hide it from you."
          isOn={settings.watchHistoryVisible}
          onChange={handleToggle('watchHistoryVisible')}
        />
        <SettingsToggle
          label="Viewing activity tracking"
          description="Track which titles you open and how long you watch them."
          isOn={settings.activityTracking}
          onChange={handleToggle('activityTracking')}
        />
        <div style={settingsStyles.row(false)}>
          <div>
            <div style={settingsStyles.rowLabel}>Export your data</div>
            <div style={settingsStyles.rowDescription}>Download a JSON copy of your account, profiles, and watchlists.</div>
          </div>
          <button type="button" style={settingsStyles.rowButton('secondary')} onClick={handleExport}>
            Download
          </button>
        </div>
      </div>
    ),

    account: (
      <div style={settingsStyles.section}>
        <h2 style={settingsStyles.sectionHeader}>Account</h2>
        <div style={settingsStyles.row(false)}>
          <div>
            <div style={settingsStyles.rowLabel}>Username</div>
            {!editingUsername ? (
              <div style={settingsStyles.rowDescription}>{user?.username}</div>
            ) : (
              <div style={settingsStyles.inlineEditor}>
                <input
                  type="text"
                  value={usernameDraft}
                  onChange={(e) => setUsernameDraft(e.target.value)}
                  style={settingsStyles.inlineInput}
                  maxLength={32}
                  autoFocus
                />
              </div>
            )}
          </div>
          <div style={settingsStyles.rowControl}>
            {!editingUsername ? (
              <button
                type="button"
                style={settingsStyles.rowButton('secondary')}
                onClick={() => {
                  setUsernameDraft(user?.username ?? '');
                  setEditingUsername(true);
                }}
              >
                Change
              </button>
            ) : (
              <>
                <button type="button" style={settingsStyles.rowButton('primary')} onClick={handleSaveUsername}>
                  Save
                </button>
                <button
                  type="button"
                  style={{ ...settingsStyles.rowButton('secondary'), marginLeft: 8 }}
                  onClick={() => setEditingUsername(false)}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        <div style={settingsStyles.row(false)}>
          <div>
            <div style={settingsStyles.rowLabel}>Sign out</div>
            <div style={settingsStyles.rowDescription}>Log out of this account on this device.</div>
          </div>
          <button
            type="button"
            style={settingsStyles.rowButton('secondary')}
            onClick={() => {
              dispatch(setCurrentProfile(null));
              dispatch(logOut());
            }}
          >
            Sign out
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          {!confirmingDelete ? (
            <div style={settingsStyles.row(false)}>
              <div>
                <div style={settingsStyles.rowLabel}>Delete account</div>
                <div style={settingsStyles.rowDescription}>
                  Permanently remove this account, profiles, and watchlists from this device.
                </div>
              </div>
              <button
                type="button"
                style={settingsStyles.rowButton('danger')}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </button>
            </div>
          ) : (
            <div style={settingsStyles.confirmBox}>
              Delete <strong>{user?.username}</strong> and all profiles? This cannot be undone.
              <div style={settingsStyles.confirmActions}>
                <button type="button" style={settingsStyles.rowButton('danger')} onClick={handleDeleteAccount}>
                  Yes, delete everything
                </button>
                <button type="button" style={settingsStyles.rowButton('secondary')} onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    ),
  }), [profile, user, settings, editingUsername, usernameDraft, handleToggle, handleSaveUsername, handleExport, handleDeleteAccount, dispatch, confirmingDelete, currentVariant]);

  // Mobile / TV: render all sections stacked
  if (isMobile) {
    return (
      <div style={settingsStyles.page}>
        <div style={settingsStyles.singleContainer}>
          <h1 style={settingsStyles.pageTitle}>Settings</h1>
          {exportBanner && <div style={settingsStyles.banner}>{exportBanner}</div>}
          {SECTION_META.map((s) => (
            <div key={s.id}>{sections[s.id]}</div>
          ))}
        </div>
      </div>
    );
  }

  // Desktop / TV: two-column with rail
  return (
    <div style={settingsStyles.page}>
      <div style={settingsStyles.desktopContainer}>
        <aside style={settingsStyles.desktopRail}>
          <h1 style={{ ...settingsStyles.pageTitle, marginBottom: 16 }}>Settings</h1>
          {SECTION_META.map((s) => (
            <button
              key={s.id}
              type="button"
              style={settingsStyles.railLink(activeSection === s.id)}
              onClick={() => setActiveSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </aside>
        <main style={settingsStyles.desktopMain}>
          {exportBanner && <div style={settingsStyles.banner}>{exportBanner}</div>}
          {sections[activeSection]}
        </main>
      </div>
    </div>
  );
}
