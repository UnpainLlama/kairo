import { variantPickerStyles } from '../../styles/componentStyles/variantPickerStyles';
import type { VariantDef } from '../../data/variants';

interface Props {
  variant: VariantDef;
  isFocused: boolean;
  isShaking: boolean;
  onSelect: () => void;
  onLockedAttempt: () => void;
}

export function VariantCard({ variant, isFocused, isShaking, onSelect, onLockedAttempt }: Props) {
  const isLocked = variant.status === 'coming-soon';

  const handleClick = () => {
    if (isLocked) {
      onLockedAttempt();
      return;
    }
    onSelect();
  };

  const Preview = variant.Preview;

  return (
    <button
      type="button"
      style={variantPickerStyles.card(isFocused, variant.accentColor, isShaking)}
      onClick={handleClick}
      aria-label={`${variant.name}${isLocked ? ' (coming soon)' : ''}`}
      aria-disabled={isLocked}
    >
      <div style={variantPickerStyles.previewWrap}>
        <Preview accent={variant.accentColor} />
      </div>
      <div style={variantPickerStyles.cardBody}>
        <div style={variantPickerStyles.cardName(variant.accentColor, isFocused)}>
          {variant.name}
        </div>
        <div style={variantPickerStyles.cardTagline}>{variant.tagline}</div>
      </div>
      {isLocked && (
        <div style={variantPickerStyles.comingSoonBadge}>Coming Soon</div>
      )}
    </button>
  );
}
