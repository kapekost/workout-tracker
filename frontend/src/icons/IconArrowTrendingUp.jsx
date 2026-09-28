export default function IconArrowTrendingUp({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M3.5 17 9 11.3l3.6 3 7.4-8.3" strokeWidth="4.2" />
      <path d="M3.5 17 9 11.3l3.6 3 7.4-8.3" strokeWidth="1.5" opacity=".35" />
      <path d="M14.5 5.3h5.5v5.5" strokeWidth="2.6" />
    </svg>
  )
}
