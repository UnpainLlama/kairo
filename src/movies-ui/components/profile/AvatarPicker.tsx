import { useEffect, useState } from 'react';
import { profileStyles } from '../../styles/componentStyles/profileStyles';
import { fetchProfileAvatars, type AvatarOption } from '../../data/avatars';

interface AvatarPickerProps {
  selectedUrl: string;
  onSelect: (url: string) => void;
  /** TV mode focus: which avatar tile (by index) is currently focused. -1 = none. */
  focusedIndex?: number;
  /** Callback giving the picker access to the loaded options (for TV navigation length). */
  onOptionsLoaded?: (count: number) => void;
}

export function AvatarPicker({ selectedUrl, onSelect, focusedIndex = -1, onOptionsLoaded }: AvatarPickerProps) {
  const [options, setOptions] = useState<AvatarOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchProfileAvatars().then((opts) => {
      if (cancelled) return;
      setOptions(opts);
      setLoading(false);
      if (onOptionsLoaded) onOptionsLoaded(opts.length);
    });
    return () => { cancelled = true; };
  }, [onOptionsLoaded]);

  if (loading) {
    return (
      <div style={{ color: 'rgba(255,255,255,0.5)', padding: 24, textAlign: 'center' }}>
        Loading avatars…
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div style={{ color: 'rgba(255,255,255,0.5)', padding: 24, textAlign: 'center' }}>
        Couldn't load avatar options.
      </div>
    );
  }

  return (
    <div style={profileStyles.pickerGrid}>
      {options.map((opt, i) => {
        const isSelected = opt.url === selectedUrl;
        const isFocused = focusedIndex === i;
        return (
          <button
            key={opt.id}
            type="button"
            style={profileStyles.pickerTile(isSelected, isFocused)}
            onClick={() => onSelect(opt.url)}
            aria-label={opt.label}
            title={opt.label}
          >
            <img src={opt.url} alt={opt.label} style={profileStyles.pickerImage} loading="lazy" />
          </button>
        );
      })}
    </div>
  );
}
