import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { StartOrResumeButton, planForDay, VersionStamp, lastTrainedByDay, nextWorkoutId } from './Home'
import { PLAN, CYCLE, getNextWorkoutId } from '../data/workoutPlan'

vi.mock('../lib/planContext', () => ({ usePlan: () => ({ plan: PLAN, cycle: CYCLE, ready: true }) }))

// Full-page render coverage (item 10 + item 12 of the 2026-09-06 UI review).
// Home.jsx's useActiveSession() needs `ready: true` to get past its own
// loading gate; mocking the hook directly (rather than wrapping the real
// ActiveSessionProvider, which itself needs a SessionProvider) keeps this a
// self-contained unit test of Home's default export, same spirit as
// Workout.test.jsx's `vi.mock('../lib/analytics', ...)`.

// Mutable so a test can simulate the provider's own read having failed, which
// is a different failure from Home's /sessions read failing and matters just as
// much: either way `active` is unknown, and Start is a guess.
const mockActive = vi.hoisted(() => ({
  value: { active: null, refresh: vi.fn(), ready: true, failed: false },
}))
vi.mock('../lib/activeSession', () => ({ useActiveSession: () => mockActive.value }))
vi.mock('../api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))
import Home from './Home'
import { api } from '../api'

const ex1 = PLAN.upper_a.exercises[0]

function mockHomeApi({ sessions = [], recency = [], sessionsFail = false, recencyFail = false } = {}) {
  api.get.mockImplementation(async (path) => {
    if (path === '/sessions') {
      if (sessionsFail) throw new Error('offline')
      return sessions
    }
    if (path === '/exercises/recency') {
      if (recencyFail) throw new Error('offline')
      return recency
    }
    throw new Error(`unmocked GET ${path}`)
  })
}

function renderHome() {
  return render(<MemoryRouter><Home /></MemoryRouter>)
}

describe('Home (full page)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActive.value = { active: null, refresh: vi.fn(), ready: true, failed: false }
  })

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

  it('a 409 on start says a workout is already open and re-reads the active session', async () => {
    mockHomeApi({ sessions: [], recency: [] })
    const refresh = vi.fn()
    mockActive.value = { active: null, refresh, ready: true, failed: false }
    api.post.mockRejectedValue(Object.assign(new Error('API POST /sessions → 409'), { status: 409 }))
    renderHome()
    fireEvent.click(await screen.findByRole('button', { name: /^Start/ }))
    expect(await screen.findByText('A workout is already in progress')).toBeInTheDocument()
    expect(refresh).toHaveBeenCalled()
  })
})

describe('planForDay', () => {
  it('returns the real PLAN entry for a known day', () => {
    expect(planForDay('upper_a', PLAN)).toBe(PLAN.upper_a)
  })

  it('returns a fallback with name Workout and empty exercises for an unknown day', () => {
    const result = planForDay('bogus_day', PLAN)
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
    expect(lastTrainedByDay(sessions, CYCLE)).toEqual({
      upper_a: '2026-08-12', lower_a: '2026-08-10',
    })
  })

  it('ignores in-progress sessions', () => {
    const sessions = [
      { workout_day: 'upper_a', date: '2026-08-12', completed: 0 },
      { workout_day: 'upper_a', date: '2026-08-05', completed: 1 },
    ]
    expect(lastTrainedByDay(sessions, CYCLE)).toEqual({ upper_a: '2026-08-05' })
  })

  it('handles no sessions', () => {
    expect(lastTrainedByDay([], CYCLE)).toEqual({})
    expect(lastTrainedByDay(null, CYCLE)).toEqual({})
  })

  it('ignores sessions whose workout_day is not a plan day', () => {
    expect(lastTrainedByDay([{ workout_day: 'bogus', date: '2026-08-12', completed: 1 }], CYCLE))
      .toEqual({})
  })
})

describe('nextWorkoutId', () => {
  // The cycle now arrives as an argument instead of a module constant, so this
  // pins it to the static helper it replaced across every shape of input that
  // helper distinguishes.
  const s = (workout_day, over = {}) => ({ workout_day, completed: 1, ...over })
  const cases = {
    'no sessions': [],
    'null sessions': null,
    'undefined sessions': undefined,
    'a day outside the cycle': [s('imported')],
    'an unfinished latest session': [s('lower_a', { completed: 0 })],
    'only the latest session counts': [s('upper_a'), s('lower_a')],
    ...Object.fromEntries(CYCLE.map(d => [`latest is ${d}`, [s(d)]])),
  }
  Object.entries(cases).forEach(([name, sessions]) => {
    it(`matches getNextWorkoutId for ${name}`, () => {
      expect(nextWorkoutId(sessions, CYCLE)).toBe(getNextWorkoutId(sessions))
    })
  })

  it('wraps from the last day to the first of whatever cycle it is given', () => {
    expect(nextWorkoutId([s('c')], ['a', 'b', 'c'])).toBe('a')
  })

  it('has no next day for an empty cycle', () => {
    expect(nextWorkoutId([s('a')], [])).toBeUndefined()
  })
})

// ── Wave 1.1, 2026-10-03 design review: a failed read is not an empty account ──
// Before this, `.catch(() => setLoading(false))` left `sessions` at [] and the
// page asserted four things it had not checked: that there are no sessions, that
// the next day is upper_a (getNextWorkoutId([]) always answers that), that upper_a's
// exercises are what is next, and — via activeSession's own `setActive(null)` —
// that nothing is in progress.
describe('Home when a read fails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActive.value = { active: null, refresh: vi.fn(), ready: true, failed: false }
  })

  it('never claims you have no sessions', async () => {
    mockHomeApi({ sessionsFail: true })
    renderHome()
    await screen.findByRole('button', { name: /Try again/ })
    expect(screen.queryByText(/No sessions logged yet/i)).not.toBeInTheDocument()
  })

  it('offers neither Start nor Resume, because neither is knowable', async () => {
    mockHomeApi({ sessionsFail: true })
    renderHome()
    await screen.findByRole('button', { name: /Try again/ })
    expect(screen.queryByRole('button', { name: /^(Start|Resume) / })).not.toBeInTheDocument()
  })

  it('does not name a next workout day it could not read', async () => {
    mockHomeApi({ sessionsFail: true })
    renderHome()
    await screen.findByRole('button', { name: /Try again/ })
    expect(screen.queryByText(/Next up/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/In progress/i)).not.toBeInTheDocument()
  })

  it('says nothing was lost — the question behind the empty state', async () => {
    mockHomeApi({ sessionsFail: true })
    renderHome()
    expect(await screen.findByText(/Nothing was lost/i)).toBeInTheDocument()
  })

  it('Try again re-reads instead of leaving the user stuck', async () => {
    mockHomeApi({ sessionsFail: true })
    renderHome()
    await screen.findByRole('button', { name: /Try again/ })
    api.get.mockClear()
    api.get.mockImplementation(async (path) => (path === '/sessions' ? [] : []))
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    await screen.findByRole('button', { name: /^Start / })
    expect(api.get).toHaveBeenCalledWith('/sessions')
  })

  it('withholds Start when the provider could not resolve the active session either', async () => {
    mockHomeApi({ sessions: [] })
    mockActive.value = { active: null, refresh: vi.fn(), ready: true, failed: true }
    renderHome()
    await screen.findByRole('button', { name: /Try again/ })
    expect(screen.queryByRole('button', { name: /^Start / })).not.toBeInTheDocument()
  })

  it('does not offer the muscle picker when sessions could not be read, even if recency loaded', async () => {
    // The picker starts workouts, and with sessions unread it cannot know one is already open.
    mockHomeApi({
      sessionsFail: true,
      recency: [{ exercise_id: ex1.id, sets: 3, last_at: '2026-09-01 10:00:00', last_date: '2026-09-01' }],
    })
    renderHome()
    await screen.findByRole('button', { name: /Try again/ })
    expect(screen.queryByText('Muscle groups')).not.toBeInTheDocument()
  })

  it('a failed recency read hides the muscle picker rather than showing it empty', async () => {
    // An empty group list reads as "you have never trained anything", which is
    // a second false claim on the same page.
    mockHomeApi({ recencyFail: true })
    renderHome()
    await screen.findByRole('button', { name: /^Start / })
    expect(screen.queryByText('Muscle groups')).not.toBeInTheDocument()
  })
})
