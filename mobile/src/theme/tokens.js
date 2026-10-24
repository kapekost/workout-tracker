// Ported from frontend/src/lib/theme.js. The PWA sizes text in rem, which is 16px here.
const rem = (n) => n * 16

export const colors = {
  bg: '#0d0d0d',
  card: '#1a1a1a',
  border: '#2a2a2a',
  accent: '#d4ff3f',
  success: '#4ade80',
  muted: '#999999',
  muted2: '#b3b3b3',
  text: '#fff',
  danger: '#ef4444',
  textSecondary: '#e5e5e5',
  surface1: '#1f1f1f',
  divider: '#2a2a2a',
  accentWash: 'rgba(212, 255, 63, 0.14)',
  dangerBg: '#2a1a1a',
  accentDeep: '#8fae22',
  muted3: '#6b6b6b',
}

export const space = {
  xs: 4,
  sm: 8,
  smd: 10,
  md: 12,
  lg: 14,
  xl: 16,
  xxl: 20,
  xxxl: 24,
}

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 100,
}

export const fontSize = {
  xs: rem(0.65),
  sm: rem(0.7),
  base: rem(0.75),
  md: rem(0.8),
  lg: rem(0.875),
  body: rem(0.9),
  strong: rem(1.1),
  title: rem(1.75),
  display: rem(2),
}

// Role-based icon sizes, from the PWA's `icon` scale.
export const icon = {
  caption: 16,
  body: 20,
  control: 22,
  heading: 24,
  nav: 26,
  header: 28,
}

export const weight = {
  regular: 400,
  semibold: 600,
  bold: 700,
}

// React Native has one font file per weight, so a weight is part of the family name. These are the
// names the @expo-google-fonts packages register (see fonts.ts).
const FAMILY = {
  sans: { regular: 'Inter_400Regular', semibold: 'Inter_600SemiBold', bold: 'Inter_700Bold' },
  mono: {
    regular: 'JetBrainsMono_400Regular',
    semibold: 'JetBrainsMono_600SemiBold',
    bold: 'JetBrainsMono_700Bold',
  },
}

export function fontFamily(w = 'regular', mono = false) {
  return FAMILY[mono ? 'mono' : 'sans'][w]
}

// The PWA tracks uppercase labels at 0.08em; React Native takes pixels.
export function labelSpacing(size) {
  return size * 0.08
}

// Mixes a hex colour toward white by `amount` (0-1).
export function tint(hex, amount) {
  const n = parseInt(hex.slice(1), 16)
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(c + (255 - c) * amount)
  )
  return '#' + channels.map((c) => c.toString(16).padStart(2, '0')).join('')
}

export const DAY_COLORS = {
  upper_a: colors.accent,
  lower_a: '#60a5fa',
  upper_b: '#f472b6',
  lower_b: '#fb923c',
}

// A day that is not one of the four seed days gets the neutral grey.
export function dayColor(day) {
  return DAY_COLORS[day] ?? colors.muted
}
