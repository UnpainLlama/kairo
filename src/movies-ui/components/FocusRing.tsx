import { focusRingStyles } from '../styles/componentStyles/focusRingStyles';
import { mergeStyles } from '../styles/styleEngine';
import type { CSSProperties } from 'react';

interface FocusRingProps {
  isFocused: boolean;
  children: React.ReactNode;
  style?: CSSProperties;
  scale?: number;
  transformOrigin?: string;
}

export function FocusRing({ isFocused, children, style, scale, transformOrigin }: FocusRingProps) {
  const baseStyle = focusRingStyles.ring(isFocused, scale ?? 1.1, transformOrigin ?? 'center center');
  return <div style={mergeStyles(baseStyle, style)}>{children}</div>;
}
