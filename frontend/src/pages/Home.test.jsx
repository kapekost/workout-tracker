import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { StartOrResumeButton, planForDay, VersionStamp, lastTrainedByDay } from './Home'
import { PLAN } from '../data/workoutPlan'

// Full-page render coverage (item 10 + item 12 of the 2026-09-06 UI review).
// Home.jsx's useActiveSession() needs `ready: true` to get past its own
// loading gate; mocking the hook directly (rather than wrapping the real
// ActiveSessionProvider, which itself needs a SessionProvider) keeps this a
// self-contained unit test of Home's default export, same spirit as
// Workout.test.jsx's `vi.mock('../lib/analytics', ...)`.
vi.mock('../lib/activeSession', () => ({
  useActiveSession: () => ({ active: null, refresh: vi.fn(), ready: true }),
}))
vi.mock('../api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))
import Home from './Home'
import { api } from '../api'

const ex1 = PLAN.upper_a.exercises[0]

function mockHomeApi({ sessions = [], recency = [] } = {}) {
  api.get.mockImplementation(async (path) => {
    if (path === '/sessions') return sessions
    if (path === '/exercises/recency') return recency
    throw new Error(`unmocked GET ${path}`)
  })
}

function renderHome() {
  return render(<MemoryRouter><Home /></MemoryRouter>)
}

describe('Home (full page)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('first-run install: hides the muscle-group picker and the export link (no data at all yet)', async () => {
    mockHomeApi({ sessions: [], recency: [] })
    renderHome()
    await screen.findByRole('button', { name: /^Start/ })
    expect(screen.queryByText('Muscle groups')).not.toBeInTheDocument()
    expect(screen.queryByText('Export my data')).not.toBeInTheDocument()
  })

  it('once at least one exercise has been trained, shows the picker and the export link', async () => {
    mockHomeApi({
      sessions: [{ id: 1, workout_day: 'upper_a', date: '2026-09-01', completed: 1 }],
      recency: [{ exercise_id: ex1.id, sets: 3, last_at: '2026-09-01 10:00:00', last_date: '2026-09-01' }],
    })
    renderHome()
    await screen.findByRole('button', { name: /^Start/ })
    expect(await screen.findByText('Muscle groups')).toBeInTheDocument()
    expect(screen.getByText('Export my data')).toBeInTheDocument()
  })

  it('the "Last session" card is a real button, not an inert div (same defect class as DisclosureRow)', async () => {
    mockHomeApi({
      sessions: [{ id: 1, workout_day: 'upper_a', date: '2026-09-01', completed: 1 }],
      recency: [],
    })
    renderHome()
    const card = await screen.findByRole('button', { name: /Upper A/ })
    expect(card.tagName).toBe('BUTTON')
  })

  it('surfaces no developer-facing "backend" language anywhere on the page', async () => {
    mockHomeApi({
      sessions: [{ id: 1, workout_day: 'upper_a', date: '2026-09-01', completed: 1 }],
      recency: [],
    })
    const { container } = renderHome()
    await screen.findByRole('button', { name: /^Start/ })
    expect(container.textContent.toLowerCase()).not.toContain('backend')
  })

  it('a failed workout-start shows plain retry copy, not "is the backend up?"', async () => {
    mockHomeApi({ sessions: [], recency: [] })
    api.post.mockRejectedValue(new Error('network down'))
    renderHome()
    const startBtn = await screen.findByRole('button', { name: /^Start/ })
    fireEvent.click(startBtn)
    expect(await screen.findByText("Couldn't start the workout — try again")).toBeInTheDocument()
  })
})

describe('planForDay', () => {
  it('returns the real PLAN entry for a known day', () => {
    expect(planForDay('upper_a')).toBe(PLAN.upper_a)
  })

  it('returns a fallback with name Workout and empty exercises for an unknown day', () => {
    const result = planForDay('bogus_day')
    expect(result.name).toBe('Workout')
    expect(result.exercises).toEqual([])
  })
})

describe('StartOrResumeButton', () => {
  it('renders Start and calls onStart when no active session', () => {
    const onStart = vi.fn()
    render(<StartOrResumeButton active={null} plan={{ name: 'Upper A' }} color="#fff"
      starting={false} onStart={onStart} onResume={vi.fn()} />)
    const btn = screen.getByRole('button', { name: 'Start Upper A' })
    fireEvent.click(btn)
    expect(onStart).toHaveBeenCalled()
  })

  it('shows Starting… while starting', () => {
    render(<StartOrResumeButton active={null} plan={{ name: 'Upper A' }} color="#fff"
      starting={true} onStart={vi.fn()} onResume={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Starting…' })).toBeDisabled()
  })

  it('renders Resume and calls onResume when a session is active', () => {
    const onResume = vi.fn()
    render(<StartOrResumeButton active={{ id: 9 }} plan={{ name: 'Upper A' }} color="#fff"
      starting={false} onStart={vi.fn()} onResume={onResume} />)
    const btn = screen.getByRole('button', { name: 'Resume Upper A' })
    fireEvent.click(btn)
    expect(onResume).toHaveBeenCalled()
  })
})

describe('VersionStamp', () => {
  it('renders the build commit discreetly', () => {
    render(<VersionStamp />)
    expect(screen.getByText(/^v \S+$/)).toBeInTheDocument()
  })
})

describe('lastTrainedByDay', () => {
  it('maps each plan day to its most recent completed session date', () => {
    const sessions = [
      { workout_day: 'upper_a', date: '2026-08-12', completed: 1 },
      { workout_day: 'lower_a', date: '2026-08-10', completed: 1 },
      { workout_day: 'upper_a', date: '2026-08-05', completed: 1 },
    ]
    expect(lastTrainedByDay(sessions)).toEqual({
      upper_a: '2026-08-12', lower_a: '2026-08-10',
    })
  })

  it('ignores in-progress sessions', () => {
    const sessions = [
      { workout_day: 'upper_a', date: '2026-08-12', completed: 0 },
      { workout_day: 'upper_a', date: '2026-08-05', completed: 1 },
    ]
    expect(lastTrainedByDay(sessions)).toEqual({ upper_a: '2026-08-05' })
  })

  it('handles no sessions', () => {
    expect(lastTrainedByDay([])).toEqual({})
    expect(lastTrainedByDay(null)).toEqual({})
  })

  it('ignores sessions whose workout_day is not a plan day', () => {
    expect(lastTrainedByDay([{ workout_day: 'bogus', date: '2026-08-12', completed: 1 }]))
      .toEqual({})
  })
})
