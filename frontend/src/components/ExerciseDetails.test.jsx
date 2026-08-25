import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ExerciseDetails from './ExerciseDetails'

// Hoisted (unlike vi.doMock, which can't retroactively mock a dependency
// ExerciseDetails already resolved via its own static import above) —
// forces the no-frames branch deterministically for both tests below,
// regardless of which exercise id's real demo fixture data exists.
vi.mock('../lib/demos', () => ({ getDemoFrames: () => null }))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))
import { track } from '../lib/analytics'

const ex = {
  id: 'bench_press', name: 'Bench Press', sets: 3, repsLow: 6, repsHigh: 10,
  muscles: ['Chest', 'Triceps'], ytUrl: 'https://example.com/search',
  cues: ['Retract shoulder blades', 'Slight arch'],
}

beforeEach(() => vi.clearAllMocks())

describe('ExerciseDetails', () => {
  it('renders target sets/reps and the numbered cues list, and tracks cues_open', () => {
    render(<ExerciseDetails ex={ex} color="#6ee7b7" />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('6–10')).toBeInTheDocument()
    expect(screen.getByText('Retract shoulder blades')).toBeInTheDocument()
    expect(track).toHaveBeenCalledWith('cues_open', { exercise_id: 'bench_press' })
  })

  it('shows the YouTube fallback and does not track demo_view when there are no demo frames', () => {
    render(<ExerciseDetails ex={ex} color="#6ee7b7" />)
    expect(screen.getByText(/Watch form demo on YouTube/)).toBeInTheDocument()
    expect(track).not.toHaveBeenCalledWith('demo_view', expect.anything())
  })
})
