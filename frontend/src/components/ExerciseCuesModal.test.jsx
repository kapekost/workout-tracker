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

// vi.useFakeTimers() does not fake requestAnimationFrame/cancelAnimationFrame
// by default in Vitest 4, but the component's mount effect now uses a double
// rAF (instead of setTimeout(fn, 0)) to guarantee a real paint of the
// entering styles before flipping to 'open'. Explicitly include rAF in the
// faked set so tests can deterministically advance past it.
const FAKE_TIMERS_CONFIG = { toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] }
const ONE_FRAME_MS = 16 // Vitest's faked requestAnimationFrame ticks in ~16ms frame steps
const ENTER_ANIMATION_MS = ONE_FRAME_MS * 2 // two rAF frames' worth -- enough to flush the double-rAF entering -> open transition

const realMatchMedia = window.matchMedia

beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  vi.useRealTimers()
  window.matchMedia = realMatchMedia
})

// Fake timers never auto-advance: right after render(), `phase` is still
// 'entering' (the mount effect's double requestAnimationFrame -- needed so
// the browser actually paints the entering styles before flipping to 'open'
// -- hasn't resolved yet), and requestClose()'s guard ignores close requests
// until phase === 'open'. Every test below must advance past that first
// before simulating a close — otherwise the guard silently swallows the
// close request and the test would pass for the wrong reason (or fail
// confusingly with onClose never called even after advancing MODAL_EXIT_MS).
function renderOpen(onClose) {
  vi.useFakeTimers(FAKE_TIMERS_CONFIG)
  render(<ExerciseCuesModal ex={ex} color="#6ee7b7" onClose={onClose} />)
  act(() => { vi.advanceTimersByTime(ENTER_ANIMATION_MS) })
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
    // Inlined (rather than using renderOpen) so the 'entering' -> 'open'
    // transform can be asserted mid-transition, not just before/after. A
    // single animation frame is deliberately not enough here (still
    // translateY(100%) at ONE_FRAME_MS): that's what proves the double rAF
    // in the mount effect is doing real work, rather than a single
    // setTimeout/rAF tick that would already have flipped to 'open' by now.
    vi.useFakeTimers(FAKE_TIMERS_CONFIG)
    const onClose = vi.fn()
    const { container } = render(<ExerciseCuesModal ex={ex} color="#6ee7b7" onClose={onClose} />)
    const sheet = container.querySelector('.cues-sheet')
    act(() => { vi.advanceTimersByTime(ONE_FRAME_MS) }) // one frame -- not enough to flip yet
    expect(sheet.style.transform).toBe('translateY(100%)')
    act(() => { vi.advanceTimersByTime(ONE_FRAME_MS) }) // second frame -- now open
    expect(sheet.style.transform).toBe('translateY(0)')

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
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    const onClose = vi.fn()
    renderOpen(onClose)
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    act(() => { vi.advanceTimersByTime(0) }) // the reduced-motion exit still goes through setTimeout(fn, 0), not a synchronous call
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
