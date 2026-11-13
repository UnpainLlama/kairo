import { settingsStyles } from '../../styles/componentStyles/settingsStyles';

interface SettingsToggleProps {
  label: string;
  description?: string;
  isOn: boolean;
  onChange: (next: boolean) => void;
}

export function SettingsToggle({ label, description, isOn, onChange }: SettingsToggleProps) {
  return (
    <div style={settingsStyles.row(false)}>
      <div>
        <div style={settingsStyles.rowLabel}>{label}</div>
        {description && <div style={settingsStyles.rowDescription}>{description}</div>}
      </div>
      <button
        type="button"
        style={settingsStyles.toggle(isOn)}
        onClick={() => onChange(!isOn)}
        aria-pressed={isOn}
        aria-label={`${label}: ${isOn ? 'on' : 'off'}`}
      >
        <span style={settingsStyles.toggleKnob(isOn)} />
      </button>
    </div>
  );
}
