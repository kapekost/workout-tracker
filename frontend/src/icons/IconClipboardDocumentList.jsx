export default function IconClipboardDocumentList({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <path d="M7 4.2h10a2.8 2.8 0 0 1 2.8 2.8v12A2.8 2.8 0 0 1 17 21.8H7A2.8 2.8 0 0 1 4.2 19V7A2.8 2.8 0 0 1 7 4.2Z" />
      <rect x="8.1" y="2.5" width="7.8" height="4.2" rx="1.5" />
      <circle cx="8.2" cy="10" r=".85" opacity=".35" />
      <rect x="10.2" y="9.1" width="6.1" height="1.7" rx=".85" opacity=".7" />
      <circle cx="8.2" cy="13.8" r=".85" opacity=".35" />
      <rect x="10.2" y="12.9" width="6.1" height="1.7" rx=".85" opacity=".7" />
      <circle cx="8.2" cy="17.6" r=".85" opacity=".35" />
      <rect x="10.2" y="16.7" width="4.5" height="1.7" rx=".85" opacity=".7" />
    </svg>
  )
}
