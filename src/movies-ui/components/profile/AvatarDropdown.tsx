import { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { avatarDropdownStyles } from '../../styles/componentStyles/avatarDropdownStyles';
import { useCurrentProfile, useProfiles } from '../../hooks/useProfile';
import { useResponsive } from '../../hooks/useResponsive';
import { useIsTvMode } from '../../hooks/useMode';
import { setCurrentProfile } from '../../state/slices/profileSlice';
import { logOut } from '../../state/slices/authSlice';
import { setActivePage, setProfileDropdownOpen } from '../../state/slices/uiSlice';

export function AvatarDropdown() {
  const dispatch = useDispatch();
  const currentProfile = useCurrentProfile();
  const profiles = useProfiles();
  const { isMobile } = useResponsive();
  const isTv = useIsTvMode();

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mirror open state to redux so other UI (perf HUD) can shift out of the way.
  useEffect(() => {
    dispatch(setProfileDropdownOpen(open));
    return () => {
      // Ensure the flag isn't stuck on if the component unmounts while open.
      if (open) dispatch(setProfileDropdownOpen(false));
    };
  }, [open, dispatch]);

  // Close on click outside (desktop only)
  useEffect(() => {
    if (!open || isMobile || isTv) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open, isMobile, isTv]);

  // Close on Escape (all modes)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const handleSwitchProfile = useCallback((profileId: string) => {
    dispatch(setCurrentProfile(profileId));
    setOpen(false);
  }, [dispatch]);

  const handleManageProfiles = useCallback(() => {
    // Triggers ProfileSelectScreen by clearing currentProfileId
    dispatch(setCurrentProfile(null));
    setOpen(false);
  }, [dispatch]);

  const handleSettings = useCallback(() => {
    dispatch(setActivePage('settings'));
    setOpen(false);
  }, [dispatch]);

  const handleSignOut = useCallback(() => {
    dispatch(setCurrentProfile(null));
    dispatch(logOut());
    setOpen(false);
  }, [dispatch]);

  if (!currentProfile) return null;

  const trigger = (
    <button
      ref={triggerRef}
      style={avatarDropdownStyles.trigger(false, open)}
      onClick={() => setOpen((o) => !o)}
      aria-label="Account menu"
      aria-expanded={open}
    >
      <div style={avatarDropdownStyles.triggerAvatar}>
        {currentProfile.avatarUrl ? (
          <img src={currentProfile.avatarUrl} alt="" style={avatarDropdownStyles.triggerAvatarImg} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: '#444', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14 }}>
            {currentProfile.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div style={avatarDropdownStyles.triggerCaret(open)}>{'\u25BC'}</div>
    </button>
  );

  const menuContent = (
    <>
      {profiles.length > 1 && (
        <>
          <div style={avatarDropdownStyles.sectionLabel}>Switch profile</div>
          {profiles.map((p) => {
            const isCurrent = p.id === currentProfile.id;
            return (
              <button
                key={p.id}
                style={avatarDropdownStyles.profileRow(isCurrent, false)}
                onClick={() => !isCurrent && handleSwitchProfile(p.id)}
                disabled={isCurrent}
              >
                <div style={avatarDropdownStyles.profileAvatar}>
                  {p.avatarUrl ? (
                    <img src={p.avatarUrl} alt="" style={avatarDropdownStyles.profileAvatarImg} />
                  ) : null}
                </div>
                <span style={avatarDropdownStyles.profileNameInRow}>{p.name}</span>
                {isCurrent && <span style={avatarDropdownStyles.currentBadge}>Current</span>}
              </button>
            );
          })}
          <div style={avatarDropdownStyles.divider} />
        </>
      )}
      <button style={avatarDropdownStyles.actionRow(false)} onClick={handleManageProfiles}>
        Manage Profiles
      </button>
      <button style={avatarDropdownStyles.actionRow(false)} onClick={handleSettings}>
        Account & Settings
      </button>
      <div style={avatarDropdownStyles.divider} />
      <button style={avatarDropdownStyles.actionRow(false)} onClick={handleSignOut}>
        Sign Out
      </button>
    </>
  );

  // --- Mobile: bottom sheet ---
  if (isMobile) {
    return (
      <>
        {trigger}
        <div style={avatarDropdownStyles.mobileBackdrop(open)} onClick={() => setOpen(false)}>
          <div style={avatarDropdownStyles.mobileSheet(open)} onClick={(e) => e.stopPropagation()}>
            <div style={avatarDropdownStyles.mobileGrip} />
            {menuContent}
          </div>
        </div>
      </>
    );
  }

  // --- TV: side panel ---
  if (isTv) {
    return (
      <>
        {trigger}
        <div style={avatarDropdownStyles.tvBackdrop(open)} onClick={() => setOpen(false)}>
          <div style={avatarDropdownStyles.tvPanel(open)} onClick={(e) => e.stopPropagation()}>
            {menuContent}
          </div>
        </div>
      </>
    );
  }

  // --- Desktop: anchored dropdown ---
  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {trigger}
      {open && (
        <div style={avatarDropdownStyles.desktopMenu}>
          {menuContent}
        </div>
      )}
    </div>
  );
}
