import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Progress from './Progress'
import { type } from '../lib/theme'

vi.mock('../api', () => ({
  api: { get: vi.fn() },
}))
import { api } from '../api'

const exercises = [
  { exercise_id: 'bench_press', exercise_name: 'Bench Press' },
  { exercise_id: 'back_squat', exercise_name: 'Back Squat' },
]

function mockExercises(list = exercises, progressData = [{ date: '2026-07-01', max_weight: 60 }]) {
  api.get.mockImplementation(async (path) => {
    if (path === '/progress') return list
    // Default is a single point, deliberately keeping this under the
    // 2-session-minimum branch, which renders the "log at least 2 sessions"
    // copy instead of recharts' <ResponsiveContainer> — jsdom doesn't lay
    // out real pixel sizes, so asserting the auto-select behavior this way
    // avoids coupling this test to recharts' measurement internals.
    // Callers that need 2+ sessions (PR emphasis / trend delta tests) pass
    // their own progressData.
    if (path.startsWith('/progress/')) return progressData
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
    // Only the unconditional trophy "PBs" nav pill — no exercise chips with no data.
    // The trophy is now an aria-hidden IconTrophy SVG, which contributes no textContent.
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual([' PBs'])
  })

  it('gives the exercise chips a 10px row gap, wide enough that real (non-overlay) 44px boxes do not visually collide', async () => {
    mockExercises()
    renderProgress()
    const chip = await screen.findByRole('button', { name: 'Bench Press' })
    const row = chip.parentElement
    expect(row.style.gap).toBe('10px')
  })

  it('renders the Personal Record value larger than the Sessions value next to it', async () => {
    mockExercises(exercises, [
      { date: '2026-07-01', max_weight: 60 },
      { date: '2026-07-08', max_weight: 70 },
    ])
    renderProgress()
    await screen.findByRole('button', { name: 'Bench Press' })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/progress/bench_press'))

    const prValue = screen.getByText('Personal Record').nextElementSibling
    const sessionsValue = screen.getByText('Sessions').nextElementSibling
    expect(prValue.style.fontSize).toBe(type.size.display)
    expect(sessionsValue.style.fontSize).toBe('1.5rem')
  })

  it('renders a trend delta once 2+ sessions are loaded', async () => {
    mockExercises(exercises, [
      { date: '2026-07-01', max_weight: 60 },
      { date: '2026-07-08', max_weight: 70 },
    ])
    renderProgress()
    await screen.findByRole('button', { name: 'Bench Press' })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/progress/bench_press'))

    expect(await screen.findByText('+10 kg since 07-01')).toBeInTheDocument()
  })

  it('renders no delta (and does not crash) when only one session is logged', async () => {
    mockExercises()
    renderProgress()
    await screen.findByRole('button', { name: 'Bench Press' })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/progress/bench_press'))

    expect(screen.queryByText(/kg since/)).not.toBeInTheDocument()
  })
})
