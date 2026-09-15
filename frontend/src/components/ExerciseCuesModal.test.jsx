import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import ExerciseCuesModal from './ExerciseCuesModal'

vi.mock('../lib/demos', () => ({ getDemoFrames: () => null }))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))

const ex = {
  id: 'bench_press', name: 'Bench Press', alt: 'or Dumbbell Press',
  sets: 3, repsLow: 6, repsHigh: 10, muscles: ['Chest'],
  ytUrl: 'https://example.com', cues: ['Retract shoulder blades'],
}

const MODAL_EXIT_MS = 250 // must match the constant in ExerciseCuesModal.jsx

beforeEach(() => vi.clearAllMocks())
afterEach(() => { vi.useRealTimers() })

// Fake timers never auto-advance: right after render(), `phase` is still
// 'entering' (the mount's setTimeout(fn, 0) that flips it to 'open' hasn't
// fired yet), and requestClose()'s guard ignores close requests until
// phase === 'open'. Every test below must advance past that first before
// simulating a close — otherwise the guard silently swallows the close
// request and the test would pass for the wrong reason (or fail confusingly
// with onClose never called even after advancing MODAL_EXIT_MS).
function renderOpen(onClose) {
  render(<ExerciseCuesModal ex={ex} color="#6ee7b7" onClose={onClose} />)
  act(() => { vi.advanceTimersByTime(0) })
}

describe('ExerciseCuesModal', () => {
  it('renders as a labeled dialog', () => {
    render(<ExerciseCuesModal ex={ex} color="#6ee7b7" onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.getAttribute('aria-label')).toContain('Bench Press')
  })

  it('clicking inside the sheet does not call onClose', () => {
    // Advance past 'entering' -> 'open' first so this exercises stopPropagation
    // on the sheet's onClick, not just requestClose's phase guard (which would
    // silently swallow any bubbled click while phase is still 'entering' and
    // make this pass for the wrong reason).
    vi.useFakeTimers()
    const onClose = vi.fn()
    renderOpen(onClose)
    fireEvent.click(screen.getByText('Bench Press'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape defers onClose until the exit animation finishes', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    renderOpen(onClose)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(MODAL_EXIT_MS) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicking the backdrop defers onClose the same way', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    renderOpen(onClose)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(MODAL_EXIT_MS) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('the close button defers onClose the same way', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    renderOpen(onClose)
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    expect(onClose).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(MODAL_EXIT_MS) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a second close request while already closing does not schedule a second onClose call', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    renderOpen(onClose)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'Escape' }) // repeated while closing
    act(() => { vi.advanceTimersByTime(MODAL_EXIT_MS) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('reduced motion closes immediately, with no animation delay', () => {
    vi.useFakeTimers()
    const original = window.matchMedia
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    const onClose = vi.fn()
    renderOpen(onClose)
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    act(() => { vi.advanceTimersByTime(0) }) // the reduced-motion exit still goes through setTimeout(fn, 0), not a synchronous call
    expect(onClose).toHaveBeenCalledTimes(1)
    window.matchMedia = original
  })
})
