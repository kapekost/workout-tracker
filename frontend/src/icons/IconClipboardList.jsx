export default function IconClipboardList({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <rect x="4" y="3.2" width="16" height="17.6" rx="3" />
      <circle cx="7.6" cy="8" r="1.05" opacity=".45" />
      <rect x="10" y="7.1" width="6.7" height="1.8" rx=".9" opacity=".72" />
      <circle cx="7.6" cy="12" r="1.05" opacity=".45" />
      <rect x="10" y="11.1" width="6.7" height="1.8" rx=".9" opacity=".72" />
      <circle cx="7.6" cy="16" r="1.05" opacity=".45" />
      <rect x="10" y="15.1" width="5.2" height="1.8" rx=".9" opacity=".72" />
    </svg>
  )
}
