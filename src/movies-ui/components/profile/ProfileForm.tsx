import { useState, useEffect, useRef } from 'react';
import { profileStyles } from '../../styles/componentStyles/profileStyles';
import { AvatarPicker } from './AvatarPicker';
import { useIsTvMode } from '../../hooks/useMode';
import { fetchProfileAvatars } from '../../data/avatars';

interface ProfileFormProps {
  mode: 'create' | 'edit';
  initialName?: string;
  initialAvatarUrl?: string;
  onSave: (name: string, avatarUrl: string) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

export function ProfileForm({
  mode, initialName = '', initialAvatarUrl = '', onSave, onDelete, onCancel,
}: ProfileFormProps) {
  const isTv = useIsTvMode();
  const [name, setName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pick a default avatar on create if none chosen
  useEffect(() => {
    if (mode === 'create' && !avatarUrl) {
      fetchProfileAvatars().then((opts) => {
        if (opts.length > 0 && !avatarUrl) {
          setAvatarUrl(opts[Math.floor(Math.random() * opts.length)].url);
        }
      });
    }
  }, [mode, avatarUrl]);

  useEffect(() => {
    if (!isTv && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isTv]);

  // TV focus rows: [nameInput, avatarPicker (one row), saveButton, deleteButton?, cancelButton]
  // Simplified: Tab/Shift-Tab between sections, Enter to activate
  // For brevity in TV mode, native Tab order works since these are real <button>/<input> elements
  // and TV mode doesn't intercept Tab. Arrow keys will be passed through to the engine.
  // Treat the form like a regular HTML form for now.

  const canSave = name.trim().length > 0 && avatarUrl.length > 0;

  return (
    <div style={profileStyles.formContainer}>
      <div style={profileStyles.formHeader}>
        {mode === 'create' ? 'Create Profile' : 'Edit Profile'}
      </div>

      <div style={profileStyles.formSubheader}>Profile name</div>
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        style={profileStyles.textInput(false)}
        maxLength={32}
      />

      <div style={profileStyles.formSubheader}>Choose an icon</div>
      <AvatarPicker selectedUrl={avatarUrl} onSelect={setAvatarUrl} />

      <div style={profileStyles.formButtonRow}>
        <button
          type="button"
          style={profileStyles.formButton('primary', false, !canSave)}
          onClick={() => canSave && onSave(name.trim(), avatarUrl)}
          disabled={!canSave}
        >
          Save
        </button>
        <button
          type="button"
          style={profileStyles.formButton('secondary', false, false)}
          onClick={onCancel}
        >
          Cancel
        </button>
        {mode === 'edit' && onDelete && (
          confirmingDelete ? (
            <>
              <button
                type="button"
                style={profileStyles.formButton('danger', false, false)}
                onClick={onDelete}
              >
                Confirm Delete
              </button>
              <button
                type="button"
                style={profileStyles.formButton('secondary', false, false)}
                onClick={() => setConfirmingDelete(false)}
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              style={profileStyles.formButton('danger', false, false)}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete Profile
            </button>
          )
        )}
      </div>
    </div>
  );
}
