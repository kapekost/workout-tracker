import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Progress from './Progress'

vi.mock('../api', () => ({
  api: { get: vi.fn() },
}))
import { api } from '../api'

const exercises = [
  { exercise_id: 'bench_press', exercise_name: 'Bench Press' },
  { exercise_id: 'back_squat', exercise_name: 'Back Squat' },
]

function mockExercises(list = exercises) {
  api.get.mockImplementation(async (path) => {
    if (path === '/progress') return list
    // A single point deliberately keeps this under the 2-session-minimum
    // branch, which renders the "log at least 2 sessions" copy instead of
    // recharts' <ResponsiveContainer> — jsdom doesn't lay out real pixel
    // sizes, so asserting the auto-select behavior this way avoids coupling
    // this test to recharts' measurement internals.
    if (path.startsWith('/progress/')) return [{ date: '2026-07-01', max_weight: 60 }]
    throw new Error(`unmocked GET ${path}`)
  })
}

function renderProgress() {
  return render(
    <MemoryRouter>
      <Progress />
    </MemoryRouter>
  )
}

beforeEach(() => { vi.clearAllMocks() })

describe('Progress page', () => {
  it('auto-selects the first exercise on load — opens on real data, not an empty chooser', async () => {
    mockExercises()
    renderProgress()
    await screen.findByRole('button', { name: 'Bench Press' })
    // Selecting happens with no tap at all: the per-exercise card (named
    // after the auto-selected exercise) must already be showing.
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/progress/bench_press'))
    expect(await screen.findByText('Bench Press', { selector: 'p' })).toBeInTheDocument()
  })

  it('a user tap still switches the selected exercise normally', async () => {
    mockExercises()
    renderProgress()
    await screen.findByRole('button', { name: 'Bench Press' })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/progress/bench_press'))
    fireEvent.click(screen.getByRole('button', { name: 'Back Squat' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/progress/back_squat'))
    expect(await screen.findByText('Back Squat', { selector: 'p' })).toBeInTheDocument()
  })

  it('renders the empty state, not a crash, when there is no logged data at all', async () => {
    mockExercises([])
    renderProgress()
    expect(await screen.findByText('No data yet.')).toBeInTheDocument()
    // Only the unconditional "🏆 PBs" nav pill — no exercise chips with no data.
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['🏆 PBs'])
  })

  it('gives the exercise chips a 10px row gap, wide enough that real (non-overlay) 44px boxes do not visually collide', async () => {
    mockExercises()
    renderProgress()
    const chip = await screen.findByRole('button', { name: 'Bench Press' })
    const row = chip.parentElement
    expect(row.style.gap).toBe('10px')
  })
})
