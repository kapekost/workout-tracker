import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Progress from './Progress'
import { type, colors, icon } from '../lib/theme'

vi.mock('../api', () => ({
  api: { get: vi.fn() },
}))
import { api } from '../api'

// jsdom's CSSOM serializes an inline hex color back out as rgb(...) — see
// Chip.test.jsx/Workout.test.jsx's identical helper.
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

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

  describe('Personal Record shows the best single (#231)', () => {
    const estimatedSession = {
      date: '2026-07-08', max_weight: 22.5, reps: 1,
      best_weight: 20, best_reps: 8, best_single: 25.5, best_estimated: true,
    }
    const realSession = {
      date: '2026-07-01', max_weight: 60, reps: 1,
      best_weight: 60, best_reps: 1, best_single: 60, best_estimated: false,
    }

    async function load(progressData) {
      mockExercises(exercises, progressData)
      renderProgress()
      await screen.findByRole('button', { name: 'Bench Press' })
      await waitFor(() => expect(api.get).toHaveBeenCalledWith('/progress/bench_press'))
      return (await screen.findByText('Personal Record')).nextElementSibling
    }

    it('shows the estimated single, "est." and the source set when the best set had reps > 1', async () => {
      const value = await load([estimatedSession])
      expect(value.textContent).toContain('25.5 kg')
      expect(screen.getByText('est. from 20 kg × 8')).toBeInTheDocument()
    })

    it('shows the plain weight with no "est." for a real single', async () => {
      const value = await load([realSession])
      expect(value.textContent).toContain('60 kg')
      expect(screen.queryByText(/est\./)).not.toBeInTheDocument()
    })

    it('picks the best single across sessions, not the heaviest weight', async () => {
      const value = await load([realSession, { ...estimatedSession, best_single: 70, max_weight: 65, best_weight: 60, best_reps: 3 }])
      expect(value.textContent).toContain('70 kg')
      expect(screen.getByText('est. from 60 kg × 3')).toBeInTheDocument()
    })

    it('keeps the trophy and uses the body icon size', async () => {
      const value = await load([realSession])
      const svg = value.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg.getAttribute('width')).toBe(String(icon.body))
    })

    it('falls back to the heaviest weight when the response has no single fields', async () => {
      const value = await load([{ date: '2026-07-01', max_weight: 60 }])
      expect(value.textContent).toContain('60 kg')
      expect(screen.queryByText(/est\./)).not.toBeInTheDocument()
    })

    it('breaks a tie on the single by the heavier source set', async () => {
      await load([
        { date: '2026-07-01', max_weight: 100, best_weight: 60, best_reps: 3, best_single: 66, best_estimated: true },
        { date: '2026-07-08', max_weight: 70, best_weight: 66, best_reps: 1, best_single: 66, best_estimated: false },
      ])
      expect(screen.queryByText(/est\./)).not.toBeInTheDocument()
    })
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

  it('renders a non-positive delta in muted (not success) color, with no + prefix', async () => {
    // Descending weight: delta < 0. Final-review finding (2026-09-27): every
    // prior delta test only exercised the delta > 0 branch, leaving the
    // muted/no-prefix branch (delta <= 0) completely unguarded.
    mockExercises(exercises, [
      { date: '2026-07-01', max_weight: 70 },
      { date: '2026-07-08', max_weight: 65 },
    ])
    renderProgress()
    await screen.findByRole('button', { name: 'Bench Press' })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/progress/bench_press'))

    const delta = await screen.findByText('-5 kg since 07-01')
    expect(delta).toBeInTheDocument()
    expect(delta.style.color).toBe(hexToRgb(colors.muted))
  })

  it('renders no delta (and does not crash) when only one session is logged', async () => {
    mockExercises()
    renderProgress()
    await screen.findByRole('button', { name: 'Bench Press' })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/progress/bench_press'))

    expect(screen.queryByText(/kg since/)).not.toBeInTheDocument()
  })
})

// ── Wave 1.1, 2026-10-03 design review ──
describe('Progress when a read fails', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('a failed exercise list does not claim you have no data', async () => {
    api.get.mockRejectedValue(new Error('offline'))
    renderProgress()
    await screen.findByRole('alert')
    expect(screen.queryByText(/No data yet/i)).not.toBeInTheDocument()
  })

  it('a failed series read does not claim you have not logged enough', async () => {
    // The old catch fell through to `data.length < 2`, which says "Log at least
    // 2 sessions to see a trend" — advice derived from a response that never
    // arrived.
    api.get.mockImplementation(async (path) => {
      if (path === '/progress') return [{ exercise_id: 'bench', exercise_name: 'Bench Press' }]
      throw new Error('offline')
    })
    renderProgress()
    expect(await screen.findByText(/couldn't load this trend/i)).toBeInTheDocument()
    expect(screen.queryByText(/Log at least 2 sessions/i)).not.toBeInTheDocument()
  })
})
