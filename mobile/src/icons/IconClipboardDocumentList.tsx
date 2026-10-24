import PngIcon from './PngIcon';

export default function IconClipboardDocumentList({ size = 20, opacity }: { size?: number; opacity?: number }) {
  return <PngIcon source={require('../../assets/icons/clipboard.png')} size={size} opacity={opacity} />;
}
