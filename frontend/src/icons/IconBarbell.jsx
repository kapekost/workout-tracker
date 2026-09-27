export default function IconBarbell({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <rect x="2.2" y="8.1" width="3.1" height="7.8" rx="1.5" />
      <rect x="5.1" y="5.1" width="3.3" height="13.8" rx="1.5" />
      <rect x="8.1" y="7" width="3.1" height="10" rx="1.3" />
      <rect x="12.8" y="7" width="3.1" height="10" rx="1.3" />
      <rect x="15.6" y="5.1" width="3.3" height="13.8" rx="1.5" />
      <rect x="18.7" y="8.1" width="3.1" height="7.8" rx="1.5" />
      <rect x="9.6" y="9.2" width="4.8" height="5.6" rx="1.2" />
      <path d="M9.8 10.4h4.4v1.1H9.8z" opacity=".25" />
    </svg>
  )
}
