import { rowTitleStyles } from '../styles/componentStyles/rowTitleStyles';

interface RowTitleProps {
  title: string;
  isRowFocused: boolean;
  paddingLeft?: number;
}

export function RowTitle({ title, isRowFocused, paddingLeft }: RowTitleProps) {
  return <div style={rowTitleStyles.title(isRowFocused, paddingLeft)}>{title}</div>;
}
