import { Image } from 'react-native';

// The one non-square icon: sized by height, and the width follows the source's aspect ratio.
const SOURCE = require('../../assets/icons/appmark.png');
const asset = Image.resolveAssetSource(SOURCE);
const aspect = asset?.width && asset.height ? asset.width / asset.height : 1;

export default function IconBarbell({ size = 20, opacity = 1 }: { size?: number; opacity?: number }) {
  return (
    <Image
      source={SOURCE}
      style={{ height: size, width: size * aspect, opacity }}
      resizeMode="contain"
      accessible={false}
    />
  );
}
