export default function IconBarbell({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <line x1="4" y1="12" x2="20" y2="12" />
      <rect x="2" y="8" width="3" height="8" rx="1" fill={color} stroke="none" />
      <rect x="19" y="8" width="3" height="8" rx="1" fill={color} stroke="none" />
      <rect x="6" y="9.5" width="2" height="5" rx="0.5" fill={color} stroke="none" />
      <rect x="16" y="9.5" width="2" height="5" rx="0.5" fill={color} stroke="none" />
    </svg>
  )
}
