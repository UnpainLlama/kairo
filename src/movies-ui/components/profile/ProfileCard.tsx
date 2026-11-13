import { useState } from 'react';
import { profileStyles } from '../../styles/componentStyles/profileStyles';

interface ProfileCardProps {
  name: string;
  avatarUrl: string;
  onClick: () => void;
  isFocused: boolean;
  isManaging?: boolean;
  size?: number;
}

export function ProfileCard({
  name, avatarUrl, onClick, isFocused, isManaging = false, size = 140,
}: ProfileCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      style={profileStyles.profileTile(isFocused, hovered)}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={isManaging ? `Edit profile ${name}` : `Switch to profile ${name}`}
    >
      <div style={{ position: 'relative' }}>
        <div style={profileStyles.avatarCircle(size, isFocused || hovered)}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={profileStyles.avatarImage} />
          ) : (
            <div style={profileStyles.avatarPlaceholder}>{name.charAt(0).toUpperCase()}</div>
          )}
        </div>
        {isManaging && <div style={profileStyles.editBadge}>{'\u270E'}</div>}
      </div>
      <div style={profileStyles.profileName(isFocused || hovered)}>{name}</div>
    </button>
  );
}
