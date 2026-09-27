export default function IconRefresh({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M5.5 8.5A7.5 7.5 0 0 1 18 5.2M17 2.3v3.4h-3.4" strokeWidth="2.2" />
      <path d="M18.5 15.5A7.5 7.5 0 0 1 6 18.8M7 21.7v-3.4h3.4" strokeWidth="2.2" />
      <path d="M5.5 8.5A7.5 7.5 0 0 1 18 5.2M17 2.3v3.4h-3.4M18.5 15.5A7.5 7.5 0 0 1 6 18.8M7 21.7v-3.4h3.4" strokeWidth=".9" opacity=".35" />
    </svg>
  )
}
