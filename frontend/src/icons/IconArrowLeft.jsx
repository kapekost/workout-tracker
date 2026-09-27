export default function IconArrowLeft({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <path d="m10.1 4.2-7.3 7.8 7.3 7.8 2.1-2-3.7-4h12.3v-3.6H8.5l3.7-4-2.1-2Z" />
      <path d="M5.2 12h13.2v1H5.2z" opacity=".22" />
    </svg>
  )
}
