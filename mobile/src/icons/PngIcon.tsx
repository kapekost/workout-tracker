import { Image, type ImageSourcePropType, type ImageStyle, type StyleProp } from 'react-native';

type Props = { source: ImageSourcePropType; size: number; opacity?: number; style?: StyleProp<ImageStyle> };

// Every PNG source is a square canvas, so `size` is the box on both axes, like an SVG icon.
export default function PngIcon({ source, size, opacity = 1, style }: Props) {
  return (
    <Image
      source={source}
      style={[{ width: size, height: size, opacity }, style]}
      resizeMode="contain"
      accessible={false}
    />
  );
}
