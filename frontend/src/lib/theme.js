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
  bg: '#0d0d0d',
  card: '#1a1a1a',
  border: '#2a2a2a',
  accent: '#d4ff3f',
  success: '#4ade80',
  muted: '#999999',
  // Recomputed 2026-09-14 for Mono+Volt palette: the old #7c8593 was tuned
  // against the old darker-blue bg/card and was not guaranteed to clear AA
  // against the new true-neutral values. #999999 measures 6.82:1 on the new
  // bg (#0d0d0d) and 6.11:1 on the new card (#1a1a1a), clearing AA with
  // margin everywhere this token is used. Computed via the WCAG
  // relative-luminance formula (see frontend/src/lib/theme.test.js).
  // muted2 is deliberately distinct from muted, not a duplicate: #b3b3b3 is a
  // lighter variant used for specific contexts (e.g. page subtitles) that need
  // to read distinctly from the base muted text but still clear AA contrast.
  muted2: '#b3b3b3',
  text: '#fff',
  danger: '#ef4444',

  // Tier 2: deliberate near-duplicate merges (spec section 2.1)
  textSecondary: '#e5e5e5',
  surface1: '#1f1f1f',
  divider: '#2a2a2a',
  accentWash: 'rgba(212, 255, 63, 0.14)',
  dangerBg: '#2a1a1a',
}

export const type = {
  size: {
    xs: '0.65rem',
    sm: '0.7rem',
    base: '0.75rem',
    md: '0.8rem',
    lg: '0.875rem',
    // Added 2026-09-06 UI review, item 16: the two literal sizes duplicated
    // across 8 and 4 call sites respectively (exercise names, session
    // titles, the app name, the Log Set label, and others). Deliberately not
    // a full rationalisation of the type scale's other one-off sizes (0.95,
    // 1.2, 1.25...) -- the review explicitly rejects that; these two cover
    // the only values actually duplicated enough to be worth a token.
    body: '0.9rem',
    strong: '1.1rem',
    title: '1.75rem',
    display: '2rem',
  },
  // Sizes that appear in the app but are deliberately NOT on the scale above,
  // each with the reason it is allowed to be there. The 2026-10-03 design review
  // (Wave 0.5) asked for a parity guard, and the honest answer is that a strict
  // "no literals anywhere" rule would be wrong: these four are intentional, so
  // the guard's job is to catch a *fifth* appearing, not to force these onto the
  // scale. Every entry carries its reason inline, because a bare list is how
  // `2.2rem` is still here in 2027 with the justification deleted — the same
  // failure shape as `password_hash` surviving in `SELECT *`.
  //
  // `0.6rem` used to be a fifth entry. It is gone: the scale floor exists to
  // stop drift, not to police legibility, and one of its three call sites was
  // the app's most safety-relevant micro-copy ("0 = bodyweight only", read
  // mid-set). All three moved up to `sm`.
  offScale: {
    // Exactly 16px. iOS Safari zooms the whole page in when a focused input
    // computes below 16px, throwing the rest of the screen off-screen. This is
    // a platform floor, not a design preference, so it is not negotiable against
    // the scale — which is why it gets an entry instead of a token.
    '1rem': 'iOS 16px focused-input floor (.field, the number inputs, the note textarea)',
    // Glyph-sized text: btn-icon (which is also NumControl's +/- steppers, the
    // most-tapped control in the app), the shared number input, and Home's
    // "›" chevron. Characters, not prose, so the scale's reading sizes do not
    // apply.
    '1.25rem': 'icon glyphs: btn-icon, input[type=number], the last-session chevron',
    // The rest clock gives up height before anything else on that bar does.
    '1.5rem': 'rest clock at <=340px',
    '1.35rem': 'rest clock at <=380px',
    // The cues sheet's exercise name. It is an <h2> in a modal, so it must not
    // match the page's `title`, and a stepper heading does not read at `strong`.
    '1.3rem': 'cues-sheet exercise heading: between `strong` and the page `title`',
  },
  weight: {
    regular: 400,
    semibold: 600,
    bold: 700,
  },
  letterSpacing: {
    tight: '-0.01em',
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
