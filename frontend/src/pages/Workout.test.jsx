import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Workout from './Workout'
import { PLAN } from '../data/workoutPlan'

vi.mock('../api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))
import { api } from '../api'

const ex1 = PLAN.upper_a.exercises[0]
const ex2 = PLAN.upper_a.exercises[1]

function mockSession(sets = []) {
  api.get.mockImplementation(async (path) => {
    if (path === '/sessions/1') {
      return {
        id: 1, workout_day: 'upper_a', date: '2026-07-09', completed: 0,
        created_at: '2026-07-09 10:00:00', ended_at: null, sets,
      }
    }
    if (path === '/notes') return {}
    if (path === '/progress') return []
    if (path.startsWith('/exercises/')) return null
    if (path === '/sessions/1/prs') return []
    throw new Error(`unmocked GET ${path}`)
  })
}

function renderWorkout() {
  return render(
    <MemoryRouter initialEntries={['/workout/1']}>
      <Routes>
        <Route path="/workout/:sessionId" element={<Workout />} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
})

describe('Workout page', () => {
  it('renders a single Finish control', async () => {
    mockSession()
    renderWorkout()
    await screen.findByText(ex1.name)
    const finishButtons = screen.getAllByRole('button', { name: /finish/i })
    expect(finishButtons).toHaveLength(1)
  })

  it('logs the next set with max(set_number)+1, not count+1', async () => {
    // set #1 of two was deleted earlier; only #2 remains
    mockSession([{ id: 5, exercise_id: ex1.id, exercise_name: ex1.name,
                   set_number: 2, reps: 8, weight_kg: 60 }])
    api.post.mockImplementation(async (path, body) => ({ id: 99, ...body }))
    renderWorkout()
    const btn = await screen.findByRole('button', { name: /log set/i })
    await act(async () => { fireEvent.click(btn) })
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].set_number).toBe(3)
  })

  it('scrolls the next exercise into view on auto-advance', async () => {
    // one set away from finishing exercise 1
    const nearlyDone = Array.from({ length: ex1.sets - 1 }, (_, i) => ({
      id: i + 1, exercise_id: ex1.id, exercise_name: ex1.name,
      set_number: i + 1, reps: 8, weight_kg: 60,
    }))
    mockSession(nearlyDone)
    api.post.mockImplementation(async (path, body) => ({ id: 99, ...body }))
    renderWorkout()
    const btn = await screen.findByRole('button', { name: /log set/i })
    await act(async () => { fireEvent.click(btn) })
    await screen.findByText(ex2.name)
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled())
  })

  it('renders a first-entry baseline quietly, with no PR fanfare', async () => {
    mockSession([{ id: 1, exercise_id: ex1.id, exercise_name: ex1.name,
                   set_number: 1, reps: 8, weight_kg: 60 }])
    api.patch.mockResolvedValue({ id: 1, completed: 1, ended_at: '2026-07-09 11:00:00' })
    api.get.mockImplementation(async (path) => {
      if (path === '/sessions/1') {
        return { id: 1, workout_day: 'upper_a', date: '2026-07-09', completed: 0,
                 created_at: '2026-07-09 10:00:00', ended_at: null,
                 sets: [{ id: 1, exercise_id: ex1.id, exercise_name: ex1.name,
                          set_number: 1, reps: 8, weight_kg: 60 }] }
      }
      if (path === '/notes') return {}
      if (path === '/progress') return []
      if (path.startsWith('/exercises/')) return null
      if (path === '/sessions/1/prs') {
        return [{ type: 'baseline', exercise_name: ex1.name, value: null, unit: null }]
      }
      throw new Error(`unmocked GET ${path}`)
    })
    renderWorkout()
    await screen.findByText(ex1.name)
    const btn = screen.getAllByRole('button', { name: /finish/i })[0]
    await act(async () => { fireEvent.click(btn) })
    await screen.findByText(/workout complete/i)
    expect(screen.getByText(new RegExp(`${ex1.name}.*baseline`, 'i'))).toBeInTheDocument()
    expect(screen.queryByText(/new pr/i)).not.toBeInTheDocument()
  })
})
