import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Workout from './Workout'
import { PLAN } from '../data/workoutPlan'
import { colors, type } from '../lib/theme'

vi.mock('../api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))
import { api } from '../api'

const ex1 = PLAN.upper_a.exercises[0]
const ex2 = PLAN.upper_a.exercises[1]

// jsdom's CSSOM serializes an inline hex color back out as rgb(...); this
// mirrors that so a .style.color assertion can still be derived from the
// theme token instead of a hardcoded rgb() literal.
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

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
    if (path === '/personal-bests') return []
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

  it('puts Finish Workout in the header, above the exercise cards, not at the bottom of the page', async () => {
    mockSession()
    renderWorkout()
    const exerciseTitle = await screen.findByText(ex1.name)
    const finishBtn = screen.getByRole('button', { name: /finish workout/i })
    // The header slot was previously empty (a space-between row with only
    // one child) while Finish sat below every exercise card. It must now
    // precede the first exercise card in document order.
    expect(finishBtn.compareDocumentPosition(exerciseTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('finishing from the header Finish control still calls the finish endpoint', async () => {
    mockSession()
    api.patch.mockResolvedValue({ id: 1, completed: 1, ended_at: '2026-07-09 11:00:00' })
    renderWorkout()
    await screen.findByText(ex1.name)
    const finishBtn = screen.getByRole('button', { name: /finish workout/i })
    await act(async () => { fireEvent.click(finishBtn) })
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/sessions/1', { completed: true }))
    await screen.findByText(/workout complete/i)
  })

  it('logs the next set with max(set_number)+1, not count+1', async () => {
    // set #1 of two was deleted earlier; only #2 remains
    mockSession([{ id: 5, exercise_id: ex1.id, exercise_name: ex1.name,
                   set_number: 2, reps: 8, weight_kg: 60 }])
    api.post.mockImplementation(async (path, body) => ({ id: 99, ...body }))
    renderWorkout()
    const btn = await screen.findByRole('button', { name: /log set/i })
    expect(btn).toHaveTextContent('Log Set 3') // label must match what will be logged
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
      if (path === '/personal-bests') return []
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
    // Plain "Done", not the developer-shorthand "Done → Home".
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(screen.queryByText(/→/)).not.toBeInTheDocument()
  })

  it('prefills the very first exercise from a historical PB when there is no in-app history', async () => {
    api.get.mockImplementation(async (path) => {
      if (path === '/sessions/1') {
        return { id: 1, workout_day: 'upper_a', date: '2026-07-09', completed: 0,
                 created_at: '2026-07-09 10:00:00', ended_at: null, sets: [] }
      }
      if (path === '/notes') return {}
      if (path === '/progress') return []
      if (path === '/personal-bests') {
        return [{ id: 1, exercise_id: ex1.id, exercise_name: ex1.name,
                   weight_kg: 120, reps: 1, achieved_year: 2021, achieved_note: null }]
      }
      if (path.startsWith('/exercises/')) return null
      if (path === '/sessions/1/prs') return []
      throw new Error(`unmocked GET ${path}`)
    })
    renderWorkout()
    await screen.findByText(ex1.name)
    await waitFor(() => expect(screen.getByDisplayValue('120')).toBeInTheDocument())
    // Reps must come from the PB itself (1), not the hardcoded default (8) —
    // a 120kg PB logged as 1 rep is a different-in-kind lift than 120kg×8.
    const repsInput = screen.getAllByRole('spinbutton')[1]
    expect(repsInput).toHaveValue(1)
  })

  it('a historical PB sets the bar for the live PR toast', async () => {
    api.get.mockImplementation(async (path) => {
      if (path === '/sessions/1') {
        return { id: 1, workout_day: 'upper_a', date: '2026-07-09', completed: 0,
                 created_at: '2026-07-09 10:00:00', ended_at: null, sets: [] }
      }
      if (path === '/notes') return {}
      if (path === '/progress') return []
      if (path === '/personal-bests') {
        return [{ id: 1, exercise_id: ex1.id, exercise_name: ex1.name,
                   weight_kg: 100, reps: 1, achieved_year: 2021, achieved_note: null }]
      }
      if (path.startsWith('/exercises/')) return null
      if (path === '/sessions/1/prs') return []
      throw new Error(`unmocked GET ${path}`)
    })
    api.post.mockImplementation(async (path, body) => ({ id: 99, ...body }))
    renderWorkout()
    await screen.findByText(ex1.name)
    await waitFor(() => expect(screen.getByDisplayValue('100')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /increase weight/i }))
    await waitFor(() => expect(screen.getByDisplayValue('102.5')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /log set/i }))
    await waitFor(() => expect(screen.getByText(/🏆 PR! 102.5kg/)).toBeInTheDocument())
  })

  it('a quick tap on a stepper bumps by exactly one step', async () => {
    mockSession()
    renderWorkout()
    await screen.findByText(ex1.name)
    const weightInput = screen.getAllByRole('spinbutton')[0]
    const before = parseFloat(weightInput.value)
    fireEvent.click(screen.getByRole('button', { name: /increase weight/i }))
    expect(parseFloat(weightInput.value)).toBe(before + 2.5)
  })

  it('holding a stepper auto-repeats, and the trailing click does not double-bump', async () => {
    mockSession()
    renderWorkout()
    // Real timers for the initial async session load — RTL's findByText polls
    // via setTimeout internally, which would hang against an already-fake clock.
    await screen.findByText(ex1.name)
    const weightInput = screen.getAllByRole('spinbutton')[0]
    const before = parseFloat(weightInput.value)
    const incBtn = screen.getByRole('button', { name: /increase weight/i })

    vi.useFakeTimers()
    fireEvent.pointerDown(incBtn)
    act(() => { vi.advanceTimersByTime(400) })          // HOLD_DELAY_MS
    act(() => { vi.advanceTimersByTime(90 * 3) })       // 3 more repeats at HOLD_REPEAT_MS
    fireEvent.pointerUp(incBtn)
    fireEvent.click(incBtn)              // the trailing click a real long-press-release fires

    // holds repeat, and the release's trailing click does not also bump —
    // exact repeat count adjusted to match real NumControl timer behavior
    // (setTimeout at the delay boundary arms the interval; the interval's
    // own first tick — not the arming timeout — is the first repeat).
    expect(parseFloat(weightInput.value)).toBe(before + 2.5 * 3)
    vi.useRealTimers()
  })

  it('a dead connection surfaces retry copy and keeps the typed weight/reps', async () => {
    mockSession()
    api.post.mockRejectedValue(new DOMException('signal timed out', 'TimeoutError'))
    renderWorkout()
    await screen.findByText(ex1.name)
    const weightInput = screen.getAllByRole('spinbutton')[0]
    const repsInput = screen.getAllByRole('spinbutton')[1]
    fireEvent.change(weightInput, { target: { value: '77.5' } })
    fireEvent.change(repsInput, { target: { value: '6' } })
    const btn = screen.getByRole('button', { name: /log set/i })
    await act(async () => { fireEvent.click(btn) })
    // The message must say to retry, not just that it failed.
    expect(await screen.findByText(/tap log set again/i)).toBeInTheDocument()
    expect(weightInput).toHaveValue(77.5)
    expect(repsInput).toHaveValue(6)
    // The button must come back so retrying is actually possible.
    expect(screen.getByRole('button', { name: /log set/i })).not.toBeDisabled()
  })

  it('a bodyweight exercise shows the Added Weight label and hint', async () => {
    // Pull-up (PLAN.upper_b.exercises[1]) is bodyweight: true; matching the
    // existing custom-session pattern used by the "unknown workout_day" test
    // below rather than the no-arg mockSession()/renderWorkout() helpers,
    // which are hardcoded to upper_a.
    api.get.mockImplementation(async (path) => {
      if (path === '/sessions/1') {
        return { id: 1, workout_day: 'upper_b', date: '2026-07-09', completed: 0,
                 created_at: '2026-07-09 10:00:00', ended_at: null, sets: [] }
      }
      if (path === '/notes') return {}
      if (path === '/progress') return []
      if (path === '/personal-bests') return []
      if (path.startsWith('/exercises/')) return null
      throw new Error(`unmocked GET ${path}`)
    })
    renderWorkout()
    await screen.findByText('Pull-up')
    fireEvent.click(screen.getByText('Pull-up'))
    expect(await screen.findByText('Added Weight (kg)')).toBeInTheDocument()
    expect(screen.getByText('0 = bodyweight only')).toBeInTheDocument()
  })

  it('a non-bodyweight exercise shows the plain Weight label with no hint', async () => {
    mockSession()
    renderWorkout()
    const label = await screen.findByText('Weight (kg)')
    expect(label).toBeInTheDocument()
    expect(screen.queryByText('0 = bodyweight only')).not.toBeInTheDocument()
  })

  it('keeps the Log Set button above the logged-sets list, so it does not walk down the card', async () => {
    // set #1 already logged; the button for set #2 must not have moved
    // below it in the DOM, or its screen position drifts every set.
    mockSession([{ id: 1, exercise_id: ex1.id, exercise_name: ex1.name,
                   set_number: 1, reps: 8, weight_kg: 60 }])
    renderWorkout()
    const btn = await screen.findByRole('button', { name: /log set/i })
    const loggedSetRow = screen.getByText('Set 1')
    expect(btn.compareDocumentPosition(loggedSetRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('gives every exercise card a scroll-margin-top matching the fixed header, so auto-advance never lands behind it', async () => {
    mockSession()
    renderWorkout()
    const title = await screen.findByText(ex1.name)
    const card = title.closest('.card')
    expect(card.style.scrollMarginTop).toBe('calc(var(--header-height, 0px) + 8px)')
  })

  it('requires a second tap to delete a logged set, and does not delete on the first', async () => {
    mockSession([{ id: 42, exercise_id: ex1.id, exercise_name: ex1.name,
                   set_number: 1, reps: 8, weight_kg: 60 }])
    renderWorkout()
    await screen.findByText(ex1.name)
    const deleteBtn = screen.getByRole('button', { name: /delete set/i })

    fireEvent.click(deleteBtn)
    // First tap must not call the API or remove the row.
    expect(api.delete).not.toHaveBeenCalled()
    expect(screen.getByText('Set 1')).toBeInTheDocument()
    const confirmBtn = screen.getByRole('button', { name: /confirm delete set/i })

    api.delete.mockResolvedValue(null)
    await act(async () => { fireEvent.click(confirmBtn) })
    expect(api.delete).toHaveBeenCalledWith('/sessions/1/sets/42')
    await waitFor(() => expect(screen.queryByText('Set 1')).not.toBeInTheDocument())
  })

  it('re-arms to a plain delete button after the confirm window elapses', async () => {
    mockSession([{ id: 42, exercise_id: ex1.id, exercise_name: ex1.name,
                   set_number: 1, reps: 8, weight_kg: 60 }])
    renderWorkout()
    await screen.findByText(ex1.name)
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: /delete set/i }))
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.getByRole('button', { name: /^delete set/i })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('promotes the overload suggestion above the last-workout history and gives it more visual weight', async () => {
    api.get.mockImplementation(async (path) => {
      if (path === '/sessions/1') {
        return { id: 1, workout_day: 'upper_a', date: '2026-07-09', completed: 0,
                 created_at: '2026-07-09 10:00:00', ended_at: null, sets: [] }
      }
      if (path === '/notes') return {}
      if (path === '/progress') return []
      if (path === '/personal-bests') return []
      if (path.startsWith('/exercises/')) {
        // Hit the top of the rep range on both sets so overloadSuggestion returns a bump.
        return { sets: [{ set_number: 1, weight_kg: 60, reps: ex1.repsHigh }, { set_number: 2, weight_kg: 60, reps: ex1.repsHigh }] }
      }
      if (path === '/sessions/1/prs') return []
      throw new Error(`unmocked GET ${path}`)
    })
    renderWorkout()
    await screen.findByText(ex1.name)
    const suggestion = await screen.findByText(/Suggested/)
    const history = screen.getByText('Last workout')
    expect(suggestion.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(suggestion.style.fontSize).toBe(type.size.lg)
    expect(parseFloat(suggestion.style.fontSize)).toBeGreaterThan(parseFloat(type.size.md))
  })

  it('gives the number steppers real, distinct aria-labels and a 44px-tall input', async () => {
    mockSession()
    renderWorkout()
    await screen.findByText(ex1.name)
    expect(screen.getByRole('button', { name: /decrease weight/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /increase weight/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /decrease reps/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /increase reps/i })).toBeInTheDocument()
    const weightInput = screen.getAllByRole('spinbutton')[0]
    const repsInput = screen.getAllByRole('spinbutton')[1]
    expect(weightInput).toHaveAccessibleName(/weight/i)
    expect(repsInput).toHaveAccessibleName(/reps/i)
    expect(parseInt(weightInput.style.minHeight, 10)).toBeGreaterThanOrEqual(44)
    expect(parseInt(repsInput.style.minHeight, 10)).toBeGreaterThanOrEqual(44)
  })

  it('the exercise title outweighs the cues link', async () => {
    mockSession()
    renderWorkout()
    const title = await screen.findByText(ex1.name)
    // Deliberately not type.size.title: that token is the page <h1>. The
    // exercise-card title only needs to outrank the cues-link text within
    // its own card (see Workout.jsx's comment at this span) — asserting the
    // literal keeps this test from silently re-locking onto the page-heading
    // token if a future migration reaches for it again.
    expect(title.style.fontSize).toBe('1.1rem')
    expect(parseFloat(title.style.fontSize)).toBeGreaterThan(parseFloat(type.size.base))
    expect(title.style.fontWeight).toBe(String(type.weight.bold))
    const cuesLink = screen.getByText(/Form cues \+ demo/)
    // jsdom's CSSOM normalizes a hex color to rgb() on readback, so the
    // expectation is derived from colors.muted rather than hardcoded —
    // the contract under test is "matches the token", not one literal string.
    expect(cuesLink.style.color).toBe(hexToRgb(colors.muted))
  })
})

describe('PR toast with a zero-weight baseline', () => {
  it('fires when beating a legitimate 0kg completed max', async () => {
    api.get.mockImplementation(async (path) => {
      if (path === '/sessions/1') {
        return { id: 1, workout_day: 'upper_a', date: '2026-07-09', completed: 0,
                 created_at: '2026-07-09 10:00:00', ended_at: null, sets: [] }
      }
      if (path === '/notes') return {}
      if (path === '/progress') {
        return [{ exercise_id: ex1.id, exercise_name: ex1.name, max_weight: 0 }]
      }
      if (path === '/personal-bests') return []
      if (path.startsWith('/exercises/')) return null
      throw new Error(`unmocked GET ${path}`)
    })
    api.post.mockImplementation(async (path, body) => ({ id: 99, ...body }))
    renderWorkout()
    await screen.findByRole('button', { name: /log set/i })
    const weightInput = screen.getAllByRole('spinbutton')[0]
    fireEvent.change(weightInput, { target: { value: '10' } })
    const btn = screen.getByRole('button', { name: /log set/i })
    await act(async () => { fireEvent.click(btn) })
    expect(await screen.findByText(/PR! 10kg/)).toBeInTheDocument()
  })
})

describe('unknown workout_day', () => {
  it('renders the unknown-day fallback instead of bailing to home', async () => {
    api.get.mockImplementation(async (path) => {
      if (path === '/sessions/1') {
        return { id: 1, workout_day: 'bogus_day', date: '2026-07-09', completed: 0,
                 created_at: '2026-07-09 10:00:00', ended_at: null, sets: [] }
      }
      if (path === '/notes') return {}
      if (path === '/progress') return []
      if (path === '/personal-bests') return []
      if (path.startsWith('/exercises/')) return null
      throw new Error(`unmocked GET ${path}`)
    })
    renderWorkout()
    expect(await screen.findByText("Couldn't find this workout.")).toBeInTheDocument()
    expect(screen.queryByText('home')).not.toBeInTheDocument()
  })
})
