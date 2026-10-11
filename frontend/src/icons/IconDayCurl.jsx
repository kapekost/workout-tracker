// Upper A: dumbbell curl. `color` draws the figure, `tone2` the targeted arms.
export default function IconDayCurl({ size = 24, color = 'currentColor', tone2 = color, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <g fill={color}>
        <rect x="2.5" y="6.9" width="1.5" height="3.8" rx=".6" />
        <rect x="6.8" y="6.9" width="1.5" height="3.8" rx=".6" />
        <rect x="15.7" y="6.9" width="1.5" height="3.8" rx=".6" />
        <rect x="20" y="6.9" width="1.5" height="3.8" rx=".6" />
      </g>
      <path d="M3.8 8.8h3.2M17 8.8h3.2" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <g fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.6 8h4.8M12 8.2v7.2M10.6 15.6h2.8" />
        <path d="M10.6 15.6l-.5 5.2H8.6M13.4 15.6l.5 5.2h1.5" />
        <path d="M8.4 12.6 5.9 9.6M15.6 12.6l2.5-3" />
      </g>
      <path d="M9.6 8.2 8.4 12.6M14.4 8.2l1.2 4.4" fill="none" stroke={tone2} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="4.6" r="2.2" fill={color} />
    </svg>
  )
}
