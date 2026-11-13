import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { variantPickerStyles } from '../../styles/componentStyles/variantPickerStyles';
import { VariantCard } from './VariantCard';
import { VARIANTS, type VariantId } from '../../data/variants';
import { useCurrentProfile } from '../../hooks/useProfile';
import { useIsTvMode } from '../../hooks/useMode';
import { setProfileVariant } from '../../state/slices/profileSlice';
import { closeVariantPicker } from '../../state/slices/uiSlice';
import type { RootState } from '../../state/store';

export function VariantPickerScreen() {
  const dispatch = useDispatch();
  const profile = useCurrentProfile();
  const isTv = useIsTvMode();
  const pickerOpen = useSelector((s: RootState) => s.ui.variantPickerOpen);

  // Re-entry from settings means the user already has a variant they could
  // back out to. First-run (no variant set) has no escape hatch — they must
  // pick something.
  const canCancel = pickerOpen && !!profile?.variant;

  const [focusIdx, setFocusIdx] = useState(0);
  const [shakeIdx, setShakeIdx] = useState<number | null>(null);

  // Reset shake after the animation duration
  useEffect(() => {
    if (shakeIdx === null) return;
    const t = setTimeout(() => setShakeIdx(null), 400);
    return () => clearTimeout(t);
  }, [shakeIdx]);

  const pick = useCallback(
    (id: VariantId) => {
      if (!profile) return;
      const def = VARIANTS.find((v) => v.id === id);
      if (!def || def.status !== 'available') return;
      dispatch(setProfileVariant({ id: profile.id, variant: id }));
      dispatch(closeVariantPicker());
    },
    [dispatch, profile]
  );

  const handleSelect = useCallback(
    (idx: number) => {
      const v = VARIANTS[idx];
      if (!v) return;
      if (v.status === 'coming-soon') {
        setShakeIdx(idx);
        return;
      }
      pick(v.id);
    },
    [pick]
  );

  const handleCancel = useCallback(() => {
    if (canCancel) dispatch(closeVariantPicker());
  }, [canCancel, dispatch]);

  // Keyboard navigation (TV mode + general accessibility)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cardCount = VARIANTS.length;
      const cancelIdx = canCancel ? cardCount : -1;
      const totalSlots = cardCount + (canCancel ? 1 : 0);

      if (e.key === 'ArrowLeft' || (isTv && e.key === 'a')) {
        e.preventDefault();
        if (focusIdx > 0 && focusIdx <= cardCount - 1) {
          setFocusIdx(focusIdx - 1);
        }
      } else if (e.key === 'ArrowRight' || (isTv && e.key === 'd')) {
        e.preventDefault();
        if (focusIdx < cardCount - 1) {
          setFocusIdx(focusIdx + 1);
        }
      } else if (e.key === 'ArrowDown' || (isTv && e.key === 's')) {
        e.preventDefault();
        if (canCancel && focusIdx < cardCount) {
          setFocusIdx(cancelIdx);
        }
      } else if (e.key === 'ArrowUp' || (isTv && e.key === 'w')) {
        e.preventDefault();
        if (focusIdx === cancelIdx) {
          setFocusIdx(0);
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (focusIdx === cancelIdx) {
          handleCancel();
        } else if (focusIdx < cardCount) {
          handleSelect(focusIdx);
        }
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        if (canCancel) {
          e.preventDefault();
          handleCancel();
        }
      }

      // Keep within bounds (in case canCancel toggled)
      if (focusIdx >= totalSlots) {
        setFocusIdx(totalSlots - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusIdx, canCancel, handleSelect, handleCancel, isTv]);

  return (
    <div style={variantPickerStyles.fullscreen}>
      <div style={variantPickerStyles.container}>
        <h1 style={variantPickerStyles.heading}>Choose your experience</h1>
        <div style={variantPickerStyles.subheading}>
          You can switch any time from Settings.
        </div>

        <div style={variantPickerStyles.cardGrid}>
          {VARIANTS.map((v, i) => (
            <VariantCard
              key={v.id}
              variant={v}
              isFocused={focusIdx === i}
              isShaking={shakeIdx === i}
              onSelect={() => pick(v.id)}
              onLockedAttempt={() => setShakeIdx(i)}
            />
          ))}
        </div>

        {canCancel && (
          <button
            type="button"
            style={variantPickerStyles.cancelButton(focusIdx === VARIANTS.length)}
            onClick={handleCancel}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
