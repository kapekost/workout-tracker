import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import TimerBar from './TimerBar'

vi.mock('../lib/sound', () => ({ playBeep: vi.fn() }))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))

const baseProps = {
  sessionStartMs: Date.now(), restTargetSec: 90,
  onAddRest: () => {}, onSkipRest: () => {}, color: '#6ee7b7',
  wakeLockHeld: false, onTogglePause: () => {},
}

describe('TimerBar rest states', () => {
  it('idle: READY and the saved rest target', () => {
    render(<TimerBar {...baseProps} restStartMs={null} paused={false} pausedRem={null} />)
    expect(screen.getByText('READY')).toBeInTheDocument()
    expect(screen.getByText('1:30')).toBeInTheDocument()
  })

  it('resting: REST and a live countdown', () => {
    render(<TimerBar {...baseProps} restStartMs={Date.now()} paused={false} pausedRem={null} />)
    expect(screen.getByText('REST')).toBeInTheDocument()
  })

  it('paused: PAUSED and the frozen remaining time', () => {
    render(<TimerBar {...baseProps} restStartMs={null} paused={true} pausedRem={45} />)
    expect(screen.getByText('PAUSED')).toBeInTheDocument()
    expect(screen.getByText('0:45')).toBeInTheDocument()
  })

  it('rest hits zero: GO', () => {
    const past = Date.now() - 91_000
    render(<TimerBar {...baseProps} restStartMs={past} paused={false} pausedRem={null} />)
    expect(screen.getByText('GO')).toBeInTheDocument()
  })

  it('idle + no sets logged yet this session: shows the discovery hint instead of READY', () => {
    render(<TimerBar {...baseProps} restStartMs={null} paused={false} pausedRem={null} hasLoggedSets={false} />)
    expect(screen.getByText('LOG A SET')).toBeInTheDocument()
    expect(screen.queryByText('READY')).not.toBeInTheDocument()
    // The rest target and the (dimmed, disabled) controls stay
    // exactly as in the plain idle state — only the label text changes.
    expect(screen.getByText('1:30')).toBeInTheDocument()
  })

  it('idle + sets already logged this session: falls back to ordinary READY (hasLoggedSets default)', () => {
    render(<TimerBar {...baseProps} restStartMs={null} paused={false} pausedRem={null} />)
    expect(screen.getByText('READY')).toBeInTheDocument()
    expect(screen.queryByText('LOG A SET')).not.toBeInTheDocument()
  })
})

// #229 Task 5: the session clock and wake chip move out to their own
// SessionClock component (in the Workout header, decision 6) -- TimerBar
// holds only the rest controls now.
describe('TimerBar — #229 rest-controls-only relayout', () => {
  it('renders no session clock and no wake chip', () => {
    const { container } = render(<TimerBar {...baseProps} restStartMs={null} paused={false} pausedRem={null} />)
    expect(container.querySelector('.session-clock')).toBeNull()
    expect(container.querySelector('.wake-chip')).toBeNull()
  })

  it('the adjusters read -30s and +30s, aria-labels unchanged', () => {
    render(<TimerBar {...baseProps} restStartMs={null} paused={false} pausedRem={null} />)
    expect(screen.getByLabelText('subtract 30 seconds')).toHaveTextContent('-30s')
    expect(screen.getByLabelText('add 30 seconds')).toHaveTextContent('+30s')
  })
})

describe('TimerBar a11y and visibility', () => {
  it('idle: controls group is not dimmed, buttons are disabled', () => {
    const { container } = render(<TimerBar {...baseProps} restStartMs={null} paused={false} pausedRem={null} />)
    expect(container.querySelector('.timer-controls').getAttribute('style')).toBeNull()
    expect(screen.getByLabelText('skip rest')).toBeDisabled()
  })

  it('announces "Rest over" in a status region once the countdown ends', () => {
    render(<TimerBar {...baseProps} restStartMs={Date.now() - 91_000} paused={false} pausedRem={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('Rest over')
  })

  it('rest ending while hidden signals at once and once more on return to visible', async () => {
    const { playBeep } = await import('../lib/sound')
    playBeep.mockClear()
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    render(<TimerBar {...baseProps} restStartMs={Date.now() - 91_000} paused={false} pausedRem={null} />)
    expect(playBeep).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')); document.dispatchEvent(new Event('visibilitychange')) })
    expect(playBeep).toHaveBeenCalledTimes(2)
  })
})
