import { Image } from 'react-native';

// The one non-square icon: sized by height, and the width follows the source's 113x64 aspect ratio.
const SOURCE = require('../../assets/icons/appmark.png');

export default function IconBarbell({ size = 20, opacity = 1 }: { size?: number; opacity?: number }) {
  return (
    <Image
      source={SOURCE}
      style={{ height: size, aspectRatio: 113 / 64, opacity }}
      resizeMode="contain"
      accessible={false}
    />
  );
}
