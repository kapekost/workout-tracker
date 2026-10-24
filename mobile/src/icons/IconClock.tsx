import PngIcon from './PngIcon';

export default function IconClock({ size = 20, opacity }: { size?: number; opacity?: number }) {
  return <PngIcon source={require('../../assets/icons/clock.png')} size={size} opacity={opacity} />;
}
