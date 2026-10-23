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
