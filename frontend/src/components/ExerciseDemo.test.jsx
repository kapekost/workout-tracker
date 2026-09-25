import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import ExerciseDemo from './ExerciseDemo'
import { getDemoFrames } from '../lib/demos'
import { track } from '../lib/analytics'

vi.mock('../lib/demos', () => ({
  getDemoFrames: vi.fn(),
}))

vi.mock('../lib/analytics', () => ({
  track: vi.fn(),
}))

const ex = {
  id: 'bench_press',
  name: 'Bench Press',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

describe('ExerciseDemo', () => {
  it('renders nothing and no tracking if no frames exist and no fallback is provided', () => {
    vi.mocked(getDemoFrames).mockReturnValue(null)
    const { container } = render(<ExerciseDemo ex={ex} color="#6ee7b7" />)
    expect(container.firstChild).toBeNull()
    expect(track).not.toHaveBeenCalled()
  })

  it('renders fallback and no tracking if no frames exist and fallback is provided', () => {
    vi.mocked(getDemoFrames).mockReturnValue(null)
    render(
      <ExerciseDemo ex={ex} color="#6ee7b7">
        <div data-testid="fallback">Fallback Content</div>
      </ExerciseDemo>
    )
    expect(screen.getByTestId('fallback')).toBeInTheDocument()
    expect(track).not.toHaveBeenCalled()
  })

  it('renders demo, tracks view, and cycles frames when frames exist', () => {
    const mockFrames = ['frame1.png', 'frame2.png', 'frame3.png']
    vi.mocked(getDemoFrames).mockReturnValue(mockFrames)

    render(<ExerciseDemo ex={ex} color="#6ee7b7" />)

    expect(screen.getByText('Demo: Bench Press')).toBeInTheDocument()
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'frame1.png')
    expect(track).toHaveBeenCalledWith('demo_view', {
      exercise_id: 'bench_press',
      source: 'exercise_demo_component',
    })

    // Advance timer to next frame
    act(() => {
      vi.advanceTimersByTime(900)
    })
    expect(img).toHaveAttribute('src', 'frame2.png')

    // Advance timer again
    act(() => {
      vi.advanceTimersByTime(900)
    })
    expect(img).toHaveAttribute('src', 'frame3.png')

    // Wraps around
    act(() => {
      vi.advanceTimersByTime(900)
    })
    expect(img).toHaveAttribute('src', 'frame1.png')
  })

  it('renders fallback if image load fails', () => {
    const mockFrames = ['frame1.png', 'frame2.png']
    vi.mocked(getDemoFrames).mockReturnValue(mockFrames)

    render(
      <ExerciseDemo ex={ex} color="#6ee7b7">
        <div data-testid="fallback">Fallback Content</div>
      </ExerciseDemo>
    )

    const img = screen.getByRole('img')
    expect(img).toBeInTheDocument()

    // Simulate image load error
    fireEvent.error(img)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByTestId('fallback')).toBeInTheDocument()
  })

  it('does not cycle frames if prefers-reduced-motion is enabled', () => {
    const mockFrames = ['frame1.png', 'frame2.png']
    vi.mocked(getDemoFrames).mockReturnValue(mockFrames)

    // Mock matchMedia
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
    })

    render(<ExerciseDemo ex={ex} color="#6ee7b7" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'frame1.png')

    act(() => {
      vi.advanceTimersByTime(900)
    })
    expect(img).toHaveAttribute('src', 'frame1.png') // remains on first frame
  })
})
