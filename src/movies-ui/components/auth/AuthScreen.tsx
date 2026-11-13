import { useState, useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { signUp, logIn } from '../../state/slices/authSlice';
import { selectAccounts } from '../../state/selectors';
import { authStyles } from '../../styles/componentStyles/authStyles';
import { useResponsive } from '../../hooks/useResponsive';
import { useIsTvMode } from '../../hooks/useMode';
import type { CSSProperties } from 'react';

type Tab = 'signup' | 'login';

export function AuthScreen() {
  const dispatch = useDispatch();
  const accounts = useSelector(selectAccounts);
  const { isMobile } = useResponsive();
  const isTv = useIsTvMode();

  // Default tab: if any accounts exist, show Log In; otherwise Sign Up.
  const [tab, setTab] = useState<Tab>(accounts.length > 0 ? 'login' : 'signup');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

  // TV focus index — 0..N within current screen
  const [focusIdx, setFocusIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build focusable items list for TV nav
  // Sign Up: [tab-signup, tab-login, input, submit]
  // Log In:  [tab-signup, tab-login, ...accounts, addAccountLink]
  const itemCount = tab === 'signup' ? 4 : 2 + accounts.length + 1;

  // Reset focus when switching tabs
  useEffect(() => {
    setFocusIdx(0);
    setError(null);
  }, [tab]);

  // Auto-focus the input on mount in Sign Up
  useEffect(() => {
    if (tab === 'signup' && inputRef.current && !isTv) {
      inputRef.current.focus();
    }
  }, [tab, isTv]);

  const handleSignUp = useCallback(() => {
    const name = username.trim();
    if (!name) {
      setError('Please enter a username.');
      return;
    }
    if (accounts.some((a) => a.username.toLowerCase() === name.toLowerCase())) {
      setError('That username is already taken on this device.');
      return;
    }
    dispatch(signUp(name));
  }, [dispatch, username, accounts]);

  const handleLogIn = useCallback((accountId: string) => {
    dispatch(logIn(accountId));
  }, [dispatch]);

  // TV keyboard handler. Only arrow keys/Enter/Space — no WASD here because
  // this screen has text inputs and we must let users type freely.
  useEffect(() => {
    if (!isTv) return;
    const handler = (e: KeyboardEvent) => {
      // If the user is typing into a form field, let the keystroke through
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        // Still allow arrow keys to move section focus, but never preventDefault on text input
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Escape') {
          return;
        }
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (focusIdx >= 2) {
          setFocusIdx(tab === 'signup' ? 0 : 1);
        } else {
          setFocusIdx(0);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (focusIdx <= 1) {
          setFocusIdx(2);
        } else {
          setFocusIdx((i) => Math.min(itemCount - 1, i + 1));
        }
      } else if (e.key === 'ArrowLeft') {
        if (focusIdx === 0 || focusIdx === 1) {
          setFocusIdx(0);
        }
      } else if (e.key === 'ArrowRight') {
        if (focusIdx === 0 || focusIdx === 1) {
          setFocusIdx(1);
        }
      } else if (e.key === 'Enter') {
        // If focus is in the input, let the form submit handler take over
        if (target && target.tagName === 'INPUT') return;
        e.preventDefault();
        if (focusIdx === 0) setTab('signup');
        else if (focusIdx === 1) setTab('login');
        else if (tab === 'signup') {
          if (focusIdx === 2) {
            inputRef.current?.focus();
          } else if (focusIdx === 3) {
            handleSignUp();
          }
        } else {
          const accountIdx = focusIdx - 2;
          if (accountIdx >= 0 && accountIdx < accounts.length) {
            handleLogIn(accounts[accountIdx].id);
          } else if (accountIdx === accounts.length) {
            setTab('signup');
          }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isTv, focusIdx, itemCount, tab, accounts, handleSignUp, handleLogIn]);

  // Pick container style based on mode
  let cardStyle: CSSProperties;
  if (isMobile) {
    cardStyle = authStyles.mobileContainer;
  } else if (isTv) {
    cardStyle = authStyles.tvCard;
  } else {
    cardStyle = authStyles.desktopCard;
  }

  return (
    <div style={authStyles.fullscreen}>
      <div style={cardStyle}>
        <div style={authStyles.logo}>JFLIX</div>

        {/* Sign Up / Log In tab toggle */}
        <div style={authStyles.tabRow}>
          <button
            style={authStyles.tab(tab === 'signup', isTv && focusIdx === 0)}
            onClick={() => setTab('signup')}
          >
            Sign Up
          </button>
          <button
            style={authStyles.tab(tab === 'login', isTv && focusIdx === 1)}
            onClick={() => setTab('login')}
          >
            Log In
          </button>
        </div>

        {tab === 'signup' ? (
          <SignUpForm
            username={username}
            setUsername={setUsername}
            onSubmit={handleSignUp}
            inputRef={inputRef}
            error={error}
            isTv={isTv}
            focusIdx={focusIdx}
          />
        ) : (
          <LogInList
            accounts={accounts}
            onPick={handleLogIn}
            onAdd={() => setTab('signup')}
            isTv={isTv}
            focusIdx={focusIdx}
          />
        )}
      </div>
    </div>
  );
}

function SignUpForm({
  username, setUsername, onSubmit, inputRef, error, isTv, focusIdx,
}: {
  username: string;
  setUsername: (v: string) => void;
  onSubmit: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  error: string | null;
  isTv: boolean;
  focusIdx: number;
}) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <div style={authStyles.fieldLabel}>Username</div>
      <input
        ref={inputRef}
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Pick a username"
        style={authStyles.textInput(isTv && focusIdx === 2)}
        autoComplete="username"
        maxLength={32}
      />
      <div style={authStyles.helperText}>
        Stored locally on this device. No password needed.
      </div>
      {error && <div style={authStyles.errorText}>{error}</div>}
      <button
        type="submit"
        style={authStyles.submitButton(isTv && focusIdx === 3, !username.trim())}
        disabled={!username.trim()}
      >
        Continue
      </button>
    </form>
  );
}

function LogInList({
  accounts, onPick, onAdd, isTv, focusIdx,
}: {
  accounts: { id: string; username: string }[];
  onPick: (id: string) => void;
  onAdd: () => void;
  isTv: boolean;
  focusIdx: number;
}) {
  if (accounts.length === 0) {
    return (
      <>
        <div style={authStyles.emptyState}>
          No accounts yet on this device.
        </div>
        <button
          style={authStyles.submitButton(isTv && focusIdx === 2, false)}
          onClick={onAdd}
        >
          Create an account
        </button>
      </>
    );
  }
  return (
    <>
      <div style={authStyles.fieldLabel}>Continue as</div>
      <div style={authStyles.accountList}>
        {accounts.map((acc, i) => (
          <button
            key={acc.id}
            style={authStyles.accountRow(isTv && focusIdx === 2 + i)}
            onClick={() => onPick(acc.id)}
          >
            <span>{acc.username}</span>
            <span style={authStyles.accountChevron}>{'\u203A'}</span>
          </button>
        ))}
      </div>
      <button
        style={authStyles.submitButton(isTv && focusIdx === 2 + accounts.length, false)}
        onClick={onAdd}
      >
        Add account
      </button>
    </>
  );
}
