import type { SvgProps } from 'react-native-svg';

export type IconProps = Omit<SvgProps, 'color'> & {
  size?: number;
  color?: string;
  // The second tone of a two-tone icon.
  tone2?: string;
  // The nav icons take their whole palette from this, never from opacity.
  active?: boolean;
};
