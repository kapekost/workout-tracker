// Central style tokens for this app's inline-style-heavy React components.
// See docs/superpowers/specs/2026-08-23-design-tokens-design.md for why
// this is a JS module and not CSS custom properties: several call sites
// (e.g. Progress.jsx's recharts props) take raw numbers, not CSS values.
//
// The tier-1 color values below are carried over unchanged from index.css's
// :root custom properties and asserted equal to them in theme.test.js, so
// the two layers can't silently drift.

export const colors = {
  // Tier 1: unchanged from index.css :root
  bg: '#0a0a12',
  card: '#111120',
  border: '#1e1e32',
  mint: '#6ee7b7',
  amber: '#fbbf24',
  muted: '#9ca3af',
  muted2: '#6b7280',
  text: '#fff',
  danger: '#ef4444',

  // Tier 2: deliberate near-duplicate merges (spec section 2.1)
  textSecondary: '#e2e8f0',
  surface1: '#14142a',
  divider: '#1e1e32',
  mintWash: 'rgba(110, 231, 183, 0.14)',
  dangerBg: '#2a1a1a',
}

export const type = {
  size: {
    xs: '0.65rem',
    sm: '0.7rem',
    base: '0.75rem',
    md: '0.8rem',
    lg: '0.875rem',
    title: '1.75rem',
    display: '2rem',
  },
  weight: {
    regular: 400,
    semibold: 600,
    bold: 700,
  },
  labelTracking: '0.08em',
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
  circle: '50%',
}
