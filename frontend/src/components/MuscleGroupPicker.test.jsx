import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MuscleGroupPicker, { RecoveryRing, ringColor, DISCLOSURE } from './MuscleGroupPicker'
import { colors } from '../lib/theme'

// jsdom's CSSOM serializes an inline hex color back out as rgb(...) — see
// Workout.test.jsx's identical helper.
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

const group = (over = {}) => ({
  id: 'quads', label: 'Quads', freshness: 0.63,
  band: 'Partly recovered (est.)', hoursSince: 31, daysSince: 1,
  daysSinceLabel: 'Yesterday', fractionalSets: 6, lastDate: '2026-08-11', ...over,
})

// 'recovered' is banned everywhere EXCEPT inside the exact band label
// 'Partly recovered (est.)' — strip that literal, case-sensitive phrase before
// scanning so only a stray, unintended use of the word fails.
const BANNED_WORDS = ['readiness', 'fatigue', 'overtrain', 'optimal', 'risk', 'recovered']
const ALLOWED_RECOVERED_PHRASE = 'Partly recovered (est.)'

function scanForBannedWords(container) {
  return container.textContent.split(ALLOWED_RECOVERED_PHRASE).join('').toLowerCase()
}

const untrained = group({
  id: 'chest', label: 'Chest', freshness: null, band: 'Not trained yet',
  hoursSince: null, daysSince: null, daysSinceLabel: 'Not trained yet',
  fractionalSets: 0, lastDate: null,
})

describe('ringColor', () => {
  // HSL hue angle, degrees. Reused instead of the old raw-channel comparison
  // (g >= r, b >= r) because that check assumed a blue-leaning accent: the
  // Mono+Volt accent is lime (#d4ff3f, hue ~73°), whose red channel (212) is
  // second-highest, not lowest, so the old per-channel check fails even
  // though lime is nowhere near a warning hue. Hue angle is what the design
  // intent ("must not look like a red/amber warning") actually means.
  function hue([r, g, b]) {
    const [rn, gn, bn] = [r, g, b].map(c => c / 255)
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), d = max - min
    if (d === 0) return 0
    let h
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    return h < 0 ? h + 360 : h
  }

  it('never returns a red or amber hue — no warning semantics', () => {
    // Checked across the whole ramp, not just one endpoint: RING_LOW (dark
    // emerald, ~162°) and RING_HIGH (lime accent, ~73°) sit at different
    // hues, and linear RGB interpolation between them doesn't guarantee the
    // midpoints stay in between — verify every step, not just the ends.
    // Red/amber/orange warning hues sit in roughly 0-45°; requiring >50°
    // keeps clear of that band with margin while still allowing lime's ~73°.
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const rgb = ringColor(f).match(/\d+/g).map(Number)
      expect(hue(rgb)).toBeGreaterThan(50)
    }
  })

  it('rises monotonically in lightness — the sequential-ramp check', () => {
    // dataviz: a sequential ramp is validated on lightness monotonicity, not
    // the categorical adjacent-pair checks. Sum of channels is a good enough
    // proxy for perceptual lightness within a single hue family.
    const lightness = f => ringColor(f).match(/\d+/g).map(Number).reduce((a, b) => a + b)
    const steps = [0, 0.25, 0.5, 0.75, 1].map(lightness)
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThan(steps[i - 1])
    }
  })

  it('has a distinct muted colour for a never-trained group', () => {
    expect(ringColor(null)).not.toBe(ringColor(0))
  })
})

describe('RecoveryRing', () => {
  it('is decorative — the band label carries the meaning', () => {
    const { container } = render(<RecoveryRing freshness={0.5} />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders an empty arc for a never-trained group', () => {
    const { container } = render(<RecoveryRing freshness={null} />)
    const arc = container.querySelectorAll('circle')[1]
    expect(Number(arc.getAttribute('stroke-dashoffset')))
      .toBeCloseTo(Number(arc.getAttribute('stroke-dasharray')), 3)
  })

  it('renders no numerals anywhere', () => {
    const { container } = render(<RecoveryRing freshness={0.63} />)
    expect(container.textContent).toBe('')
  })
})

describe('MuscleGroupPicker', () => {
  const groups = [group(), untrained]

  it('renders a chip per group with its band label', () => {
    render(<MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={vi.fn()} />)
    expect(screen.getByText('Quads')).toBeInTheDocument()
    expect(screen.getByText('Partly recovered (est.)')).toBeInTheDocument()
    expect(screen.getByText('Not trained yet')).toBeInTheDocument()
  })

  it('shows the disclosure at the point of display', () => {
    render(<MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={vi.fn()} />)
    expect(screen.getByText(DISCLOSURE)).toBeInTheDocument()
    expect(DISCLOSURE).toContain('Trust how you feel over this estimate.')
  })

  it('renders the disclosure at colors.muted2 (AA contrast), not the old sub-AA raw hex', () => {
    // The one paragraph the recovery research doc insists must always be
    // visible used to render at a raw #4b5563 (2.61:1 on --bg — see
    // theme.test.js's contrast measurements). 2026-09-06 UI review item 11.
    render(<MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={vi.fn()} />)
    const disclosure = screen.getByText(DISCLOSURE)
    expect(disclosure.style.color).toBe(hexToRgb(colors.muted2))
  })

  it('renders no percentage anywhere', () => {
    const { container } = render(
      <MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={vi.fn()} />)
    expect(container.textContent).not.toMatch(/%/)
    expect(container.textContent).not.toMatch(/percent/i)
  })

  it('does not start a workout on the first tap — it expands', () => {
    const onStart = vi.fn()
    render(<MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={onStart} />)
    fireEvent.click(screen.getByRole('button', { name: /Quads/ }))
    expect(onStart).not.toHaveBeenCalled()
    expect(screen.getByText(/last trained 31h ago, 6 fractional sets/i)).toBeInTheDocument()
  })

  it('starts the best day from the expanded chip', () => {
    const onStart = vi.fn()
    render(<MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={onStart} />)
    fireEvent.click(screen.getByRole('button', { name: /Quads/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start Lower A' }))
    expect(onStart).toHaveBeenCalledWith('lower_a')
  })

  it('collapses a chip when tapped again', () => {
    render(<MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={vi.fn()} />)
    const chip = screen.getByRole('button', { name: /Quads/ })
    fireEvent.click(chip)
    expect(screen.getByRole('button', { name: 'Start Lower A' })).toBeInTheDocument()
    fireEvent.click(chip)
    expect(screen.queryByRole('button', { name: 'Start Lower A' })).not.toBeInTheDocument()
  })

  it('replaces Start with a note while a session is active', () => {
    render(<MuscleGroupPicker groups={groups} lastTrainedByDay={{}}
      activeSession={{ id: 4 }} onStart={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Quads/ }))
    expect(screen.queryByRole('button', { name: /^Start / })).not.toBeInTheDocument()
    expect(screen.getByText('Finish your current session first')).toBeInTheDocument()
  })

  it('shows a neutral fact, not a nudge, for a never-trained group', () => {
    render(<MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Chest/ }))
    expect(screen.getByText(/Chest — not trained yet/i)).toBeInTheDocument()
  })

  it('uses none of the banned words in the collapsed grid', () => {
    const { container } = render(
      <MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={vi.fn()} />)
    const text = scanForBannedWords(container)
    for (const word of BANNED_WORDS) {
      expect(text).not.toContain(word)
    }
  })

  it('uses none of the banned words in an expanded chip', () => {
    const { container } = render(
      <MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Quads/ }))
    const text = scanForBannedWords(container)
    for (const word of BANNED_WORDS) {
      expect(text).not.toContain(word)
    }
  })

  it('uses none of the banned words with an active session', () => {
    const { container } = render(
      <MuscleGroupPicker groups={groups} lastTrainedByDay={{}}
        activeSession={{ id: 4 }} onStart={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Quads/ }))
    const text = scanForBannedWords(container)
    for (const word of BANNED_WORDS) {
      expect(text).not.toContain(word)
    }
  })

  it('gives every chip a >=44px tap target', () => {
    render(<MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={vi.fn()} />)
    const chip = screen.getByRole('button', { name: /Quads/ })
    expect(chip.className).toContain('tap-target')
    expect(parseInt(chip.style.minHeight, 10)).toBeGreaterThanOrEqual(44)
  })

  it('renders nothing when there are no groups', () => {
    const { container } = render(
      <MuscleGroupPicker groups={[]} lastTrainedByDay={{}} onStart={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing on a first-run install — every group present but untrained (all-empty rings)', () => {
    // groupRecovery([]) always returns every MUSCLE_GROUPS entry, each with
    // freshness: null (lib/recovery.js's own "not trained yet" signal) — so
    // groups.length is never 0 on a fresh install. An all-null freshness
    // list is the real "nothing to show" condition here.
    const firstRunGroups = [untrained, group({ id: 'quads', label: 'Quads', freshness: null,
      band: 'Not trained yet', hoursSince: null, daysSince: null,
      daysSinceLabel: 'Not trained yet', fractionalSets: 0, lastDate: null })]
    const { container } = render(
      <MuscleGroupPicker groups={firstRunGroups} lastTrainedByDay={{}} onStart={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('still renders once at least one group has been trained', () => {
    render(<MuscleGroupPicker groups={[group(), untrained]} lastTrainedByDay={{}} onStart={vi.fn()} />)
    expect(screen.getByText('Quads')).toBeInTheDocument()
  })
})
