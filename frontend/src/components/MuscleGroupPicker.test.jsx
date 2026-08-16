import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MuscleGroupPicker, { RecoveryRing, ringColor, DISCLOSURE } from './MuscleGroupPicker'

const group = (over = {}) => ({
  id: 'quads', label: 'Quads', freshness: 0.63,
  band: 'Partly recovered (est.)', hoursSince: 31, daysSince: 1,
  daysSinceLabel: 'Yesterday', fractionalSets: 6, lastDate: '2026-08-11', ...over,
})

const untrained = group({
  id: 'chest', label: 'Chest', freshness: null, band: 'Not trained yet',
  hoursSince: null, daysSince: null, daysSinceLabel: 'Not trained yet',
  fractionalSets: 0, lastDate: null,
})

describe('ringColor', () => {
  it('never returns a red or amber hue — no warning semantics', () => {
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const [r, g, b] = ringColor(f).match(/\d+/g).map(Number)
      expect(g).toBeGreaterThanOrEqual(r)   // green channel always leads
      expect(b).toBeGreaterThanOrEqual(r)
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

  it('uses none of the banned words', () => {
    const { container } = render(
      <MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={vi.fn()} />)
    const text = container.textContent.toLowerCase()
    for (const word of ['readiness', 'fatigue', 'overtrain', 'optimal', 'risk']) {
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
})
