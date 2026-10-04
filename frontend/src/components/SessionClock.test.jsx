import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import SessionClock from './SessionClock'

// #229 decision 6: SessionClock owns its own 1s interval so a tick never
// re-renders the whole Workout page (20+ set rows).
describe('SessionClock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('shows the elapsed time and ticks', () => {
    const startMs = Date.now() - 5000
    render(<SessionClock startMs={startMs} color="#fff" />)
    expect(screen.getByText('ACTIVE SESSION · 0:05')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.getByText('ACTIVE SESSION · 0:08')).toBeInTheDocument()
  })

  it('shows SCREEN ON only when the wake lock is held', () => {
    const startMs = Date.now()
    const { rerender } = render(<SessionClock startMs={startMs} wakeLockHeld={false} color="#fff" />)
    expect(screen.queryByText('SCREEN ON')).not.toBeInTheDocument()
    rerender(<SessionClock startMs={startMs} wakeLockHeld={true} color="#fff" />)
    expect(screen.getByText('SCREEN ON')).toBeInTheDocument()
  })
})
