import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Plan from './Plan'
import { PLAN, CYCLE } from '../data/workoutPlan'

const state = vi.hoisted(() => ({ active: null, ready: true, failed: false }))
const retry = vi.hoisted(() => vi.fn())
const refresh = vi.hoisted(() => vi.fn())

vi.mock('../lib/planContext', () => ({
  usePlan: () => ({ plan: PLAN, cycle: CYCLE, ready: true, failed: false, retry }),
}))
vi.mock('../lib/activeSession', () => ({
  useActiveSession: () => ({ active: state.active, ready: state.ready, failed: state.failed, refresh }),
}))
vi.mock('../api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))
import { api } from '../api'

const CATALOG = [
  { exercise_id: 'bench_press', name: 'Bench Press', alt: 'or Dumbbell Press', sets: 3, reps_low: 6, reps_high: 10,
    bodyweight: false, muscles: ['Chest', 'Front Delt', 'Triceps'], yt_url: null, cues: [] },
  { exercise_id: 'db_bench_press', name: 'Dumbbell Bench Press', alt: null, sets: 3, reps_low: 8, reps_high: 12,
    bodyweight: false, muscles: ['Chest', 'Front Delt', 'Triceps'], yt_url: null, cues: ['Elbows at 45 degrees'] },
  { exercise_id: 'goblet_squat', name: 'Goblet Squat', alt: null, sets: 3, reps_low: 10, reps_high: 15,
    bodyweight: false, muscles: ['Quads', 'Glutes'], yt_url: null, cues: [] },
]

const swapLine = () => 'Bench Press history stays under its old name.'
const FINISH_FIRST = 'Finish or discard your current workout first'

function renderPage() {
  return render(<MemoryRouter><Plan /></MemoryRouter>)
}

async function openEditor(exerciseName) {
  fireEvent.click(screen.getByRole('button', { name: /Upper A/ }))
  fireEvent.click(screen.getByRole('button', { name: `Edit ${exerciseName}` }))
}

function httpError(status, detail) {
  return Object.assign(new Error(`API POST /plan/update → ${status}`), { status, detail })
}

beforeEach(() => {
  vi.clearAllMocks()
  state.active = null
  state.ready = true
  state.failed = false
  api.get.mockImplementation(async (path) => {
    if (path === '/plan/catalog') return CATALOG
    throw new Error(`unexpected GET ${path}`)
  })
})

describe('Plan editing', () => {
  it('saves changed sets and reps as a confirmed modify envelope, then refetches the plan', async () => {
    api.post.mockResolvedValue({ days_affected: 1 })
    renderPage()
    await openEditor('Bench Press')
    fireEvent.click(screen.getByRole('button', { name: 'increase Sets' }))
    fireEvent.click(screen.getByRole('button', { name: 'decrease Reps from' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save for every Upper A' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/plan/update', {
      envelope: {
        schema: 'workout-tracker/plan-update/v1',
        summary: 'Edited in the app',
        day_updates: [{ day_key: 'upper_a', exercise_updates: [
          { op: 'modify', exercise_id: 'bench_press', sets: 4, reps_low: 5 },
        ] }],
      },
      confirm: true,
    }))
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: 'Save for every Upper A' })).not.toBeInTheDocument()
  })

  it('sends only the field that changed', async () => {
    api.post.mockResolvedValue({})
    renderPage()
    await openEditor('Bench Press')
    fireEvent.click(screen.getByRole('button', { name: 'decrease Reps to' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save for every Upper A' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const [, body] = api.post.mock.calls[0]
    expect(body.envelope.day_updates[0].exercise_updates).toEqual([
      { op: 'modify', exercise_id: 'bench_press', reps_high: 9 },
    ])
  })

  it('closes the editor without posting when nothing changed', async () => {
    renderPage()
    await openEditor('Bench Press')
    fireEvent.click(screen.getByRole('button', { name: 'Save for every Upper A' }))
    expect(api.post).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Save for every Upper A' })).not.toBeInTheDocument()
  })

  it('swap posts the remove and the add in one envelope for that day', async () => {
    api.post.mockResolvedValue({})
    renderPage()
    await openEditor('Bench Press')
    fireEvent.click(screen.getByRole('button', { name: 'Swap' }))
    fireEvent.click(await screen.findByRole('button', { name: /Dumbbell Bench Press/ }))
    expect(screen.getByText(swapLine())).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Swap in every Upper A' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const [path, body] = api.post.mock.calls[0]
    expect(path).toBe('/plan/update')
    expect(body).toEqual({
      envelope: {
        schema: 'workout-tracker/plan-update/v1',
        summary: 'Edited in the app',
        day_updates: [{ day_key: 'upper_a', exercise_updates: [
          { op: 'remove', exercise_id: 'bench_press' },
          { op: 'add', ...CATALOG[1] },
        ] }],
      },
      confirm: true,
    })
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1))
  })

  it('fetches the catalog once, however often the swap list is opened', async () => {
    renderPage()
    await openEditor('Bench Press')
    fireEvent.click(screen.getByRole('button', { name: 'Swap' }))
    await screen.findByRole('button', { name: /Dumbbell Bench Press/ })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Swap' }))
    await screen.findByRole('button', { name: /Dumbbell Bench Press/ })
    expect(api.get.mock.calls.filter(([p]) => p === '/plan/catalog')).toHaveLength(1)
  })

  it('shows the server field message for a 400, not a generic one', async () => {
    const detail = "day 'upper_a' (modify bench_press): reps_high 5 is below reps_low 7"
    api.post.mockRejectedValue(httpError(400, detail))
    renderPage()
    await openEditor('Bench Press')
    fireEvent.click(screen.getByRole('button', { name: 'increase Reps from' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save for every Upper A' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    expect(retry).not.toHaveBeenCalled()
  })

  it('shows the finish-first message for a 409 and re-reads the open workout', async () => {
    api.post.mockRejectedValue(httpError(409, FINISH_FIRST))
    renderPage()
    await openEditor('Bench Press')
    fireEvent.click(screen.getByRole('button', { name: 'increase Sets' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save for every Upper A' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(FINISH_FIRST)
    expect(refresh).toHaveBeenCalled()
    expect(retry).not.toHaveBeenCalled()
  })

  it('posts once when the save is tapped twice before the first request settles', async () => {
    let settle
    api.post.mockReturnValue(new Promise(r => { settle = r }))
    renderPage()
    await openEditor('Bench Press')
    fireEvent.click(screen.getByRole('button', { name: 'increase Sets' }))
    const save = screen.getByRole('button', { name: 'Save for every Upper A' })
    fireEvent.click(save)
    fireEvent.click(save)
    expect(api.post).toHaveBeenCalledTimes(1)
    settle({})
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1))
  })
})

describe('Plan reset', () => {
  it('asks for a second tap before posting, then resets and refetches', async () => {
    api.post.mockResolvedValue({ reset: true })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Reset to recommended' }))
    expect(api.post).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Tap again to reset your plan' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][0]).toBe('/plan/reset')
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1))
  })

  it('shows the finish-first message when a workout is open', async () => {
    api.post.mockRejectedValue(httpError(409, FINISH_FIRST))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Reset to recommended' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tap again to reset your plan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(FINISH_FIRST)
  })
})

describe('Plan while a workout is open', () => {
  beforeEach(() => {
    state.active = { id: 9, workout_day: 'upper_a', completed: false }
  })

  it('offers no edit, swap or reset controls, and says why', async () => {
    renderPage()
    expect(screen.getByText(FINISH_FIRST)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Upper A/ }))
    expect(screen.getByText('Bench Press')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset to recommended' })).not.toBeInTheDocument()
  })
})


describe('Plan review fixes', () => {
  it('refetches after a failure with no server answer, because the write may have landed', async () => {
    api.post.mockRejectedValue(new Error('timeout'))
    renderPage()
    await openEditor('Bench Press')
    fireEvent.click(screen.getByRole('button', { name: 'increase Sets' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save for every Upper A' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save your plan")
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('keeps reps from at or below reps to', async () => {
    api.post.mockResolvedValue({})
    renderPage()
    await openEditor('Bench Press')
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: 'decrease Reps to' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save for every Upper A' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const op = api.post.mock.calls[0][1].envelope.day_updates[0].exercise_updates[0]
    expect(op.reps_high).toBe(5)
    expect(op.reps_low).toBe(5)
  })

  it('caps the swap list at 8 and reveals the rest on request', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      exercise_id: `alt_${i}`, name: `Alt ${String(i).padStart(2, '0')}`, alt: null, sets: 3, reps_low: 8, reps_high: 12,
      bodyweight: false, muscles: ['Chest'], yt_url: null, cues: [],
    }))
    api.get.mockImplementation(async () => many)
    renderPage()
    await openEditor('Bench Press')
    fireEvent.click(screen.getByRole('button', { name: 'Swap' }))
    await screen.findByRole('button', { name: /Alt 00/ })
    expect(screen.getAllByRole('button', { name: /^Alt / })).toHaveLength(8)
    fireEvent.click(screen.getByRole('button', { name: 'Show all 12' }))
    expect(screen.getAllByRole('button', { name: /^Alt / })).toHaveLength(12)
  })

  it('says what a reset replaces once it is armed', () => {
    renderPage()
    expect(screen.queryByText(/Your logged workouts are kept/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reset to recommended' }))
    expect(screen.getByText(/replaces every day with the recommended plan/i)).toBeInTheDocument()
    expect(screen.getByText(/Your logged workouts are kept/)).toBeInTheDocument()
  })

  it('disables the other Edit buttons while a save is in flight', async () => {
    let settle
    api.post.mockReturnValue(new Promise(r => { settle = r }))
    renderPage()
    await openEditor('Bench Press')
    fireEvent.click(screen.getByRole('button', { name: 'increase Sets' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save for every Upper A' }))
    expect(screen.getByRole('button', { name: 'Edit Bent-over Row' })).toBeDisabled()
    settle({})
    await waitFor(() => expect(retry).toHaveBeenCalled())
  })

  it('says an edit applies to every future workout of that day, not past ones', async () => {
    renderPage()
    await openEditor('Bench Press')
    expect(screen.getByRole('button', { name: 'Save for every Upper A' })).toBeInTheDocument()
    expect(screen.getByText('Past workouts stay as logged.')).toBeInTheDocument()
  })

  it('confirms a successful save with a short message', async () => {
    api.post.mockResolvedValue({})
    renderPage()
    await openEditor('Bench Press')
    fireEvent.click(screen.getByRole('button', { name: 'increase Sets' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save for every Upper A' }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })
})


describe('Plan before the open-workout state is known', () => {
  it('offers no controls until the active-session read has answered', () => {
    state.ready = false
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Upper A/ }))
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset to recommended' })).not.toBeInTheDocument()
  })

  it('offers no controls and a retry when the read failed, rather than guessing', () => {
    state.failed = true
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Upper A/ }))
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset to recommended' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refresh).toHaveBeenCalled()
  })
})
