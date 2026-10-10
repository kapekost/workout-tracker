import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Workout from './Workout'
import { PLAN, CYCLE } from '../data/workoutPlan'
import { colors, type } from '../lib/theme'

// `put` is here because the note editor calls it. It was absent from this mock
// originally, which is the second half of why the broken note save shipped
// green: the mock shape and the bug agreed with each other.
vi.mock('../api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))
vi.mock('../lib/planContext', () => ({ usePlan: () => ({ plan: PLAN, cycle: CYCLE, ready: true }) }))
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
    // The trophy is now an aria-hidden IconTrophy SVG and the message text is split
    // across multiple JSX text nodes ("PR! ", "102.5", "kg on ", name), so match on
    // the toast's full textContent rather than a single contiguous text node.
    await waitFor(() => expect(document.querySelector('.toast')).toHaveTextContent('PR! 102.5kg on Bench Press'))
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

  // Arming a set starts a 3s timer. Leaving the screen inside that window must
  // not leave a callback pending against a component that no longer exists.
  it('leaves no confirm timer running when the screen goes away mid-window', async () => {
    mockSession([{ id: 42, exercise_id: ex1.id, exercise_name: ex1.name,
                   set_number: 1, reps: 8, weight_kg: 60 }])
    // Fake timers go on before render, not after: this screen also runs
    // SessionClock's and TimerBar's 1s intervals, and an effect cleanup that
    // runs after the switch resolves clearInterval to the *fake*, which cannot
    // clear a real interval. Installing them first makes every interval in the
    // tree a fake one, so the count means what it says.
    vi.useFakeTimers()
    try {
      const { unmount } = renderWorkout()
      // getBy rather than findBy: findBy polls with setTimeout, which is the
      // fake here, so it would wait on a clock only this test controls.
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(screen.getByText(ex1.name)).toBeInTheDocument()
      const before = vi.getTimerCount()

      fireEvent.click(screen.getByRole('button', { name: /delete set/i }))
      expect(vi.getTimerCount()).toBe(before + 1)

      unmount()

      // Counting rather than advancing: advancing past the window does not throw
      // even with the timer still pending, because React 19 no longer warns
      // about a setState on an unmounted component. The count is what actually
      // separates "cleared on unmount" from "leaked".
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
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

  // 2026-09-06 UI review, item 18b: a completed exercise's ✓ used to be
  // colors.mint regardless of day, while the set-dots beside it (DayAccent)
  // already fill in that day's own colour to mean the same "done" -- two
  // different "done" colours in the same row. On Lower B (day colour
  // #fb923c, orange) that read as a mint tick next to orange dots. upper_a's
  // day colour happens to equal colors.mint, which would mask a regression
  // here, so this uses lower_b specifically.
  it("colours a completed exercise's checkmark with the day's own colour, not colors.mint", async () => {
    api.get.mockImplementation(async (path) => {
      if (path === '/sessions/1') {
        return {
          id: 1, workout_day: 'lower_b', date: '2026-07-09', completed: 0,
          created_at: '2026-07-09 10:00:00', ended_at: null,
          sets: [
            { id: 1, exercise_id: 'deadlift', exercise_name: 'Deadlift', set_number: 1, reps: 6, weight_kg: 100 },
            { id: 2, exercise_id: 'deadlift', exercise_name: 'Deadlift', set_number: 2, reps: 6, weight_kg: 100 },
            { id: 3, exercise_id: 'deadlift', exercise_name: 'Deadlift', set_number: 3, reps: 6, weight_kg: 100 },
          ],
        }
      }
      if (path === '/notes') return {}
      if (path === '/progress') return []
      if (path === '/personal-bests') return []
      if (path.startsWith('/exercises/')) return null
      if (path === '/sessions/1/prs') return []
      throw new Error(`unmocked GET ${path}`)
    })
    renderWorkout()
    const title = await screen.findByText('Deadlift')
    // The checkmark is now an IconCheck SVG (not a <span>text</span>); the day
    // colour is passed straight through as its `stroke` attribute rather than
    // a CSS style, so read that attribute directly instead of style.color.
    const check = title.parentElement.querySelector('svg')
    expect(check).toBeInTheDocument()
    expect(check.getAttribute('stroke')).toBe('#fb923c')
    expect(check.getAttribute('stroke')).not.toBe(colors.accent)
  })

  // 2026-09-06 UI review, item 18c: this was the only page whose subtitle
  // used colors.muted/type.size.md instead of the colors.muted2/type.size.lg
  // pair Home, Progress, History and PersonalBests all share.
  it('styles the session-date subtitle like every other page subtitle in the app', async () => {
    mockSession()
    renderWorkout()
    await screen.findByText(ex1.name)
    const subtitle = screen.getByText('2026-07-09')
    expect(subtitle.style.color).toBe(hexToRgb(colors.muted2))
    expect(subtitle.style.fontSize).toBe(type.size.lg)
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

describe('per-exercise notes', () => {
  // The whole feature was untested, and it did not work: Workout.saveNote calls
  // api.put, api.js never exported one, and the catch turned the resulting
  // TypeError into a "Failed to save note" toast while the optimistic
  // setNotes update above it made the note appear to save.
  // mockReset, not just mockSession: vi.clearAllMocks() clears recorded calls
  // but leaves the *implementation* from the previous describe block in place,
  // and 'unknown workout day' below sets one that renders no exercise cards.
  // That pollution is why these two could not find any note UI at all.
  it('PUTs the note to the server when the textarea loses focus', async () => {
    api.get.mockReset()
    mockSession()
    renderWorkout()

    const addNote = await screen.findByRole('button', { name: /add note/i })
    await act(async () => { fireEvent.click(addNote) })
    const ta = screen.getByRole('textbox')
    fireEvent.change(ta, { target: { value: 'pause on chest' } })
    await act(async () => { fireEvent.blur(ta) })

    expect(api.put).toHaveBeenCalledWith(
      `/exercises/${ex1.id}/note`, { note: 'pause on chest' })
  })

  it('surfaces a failure rather than pretending the note saved', async () => {
    api.get.mockReset()
    mockSession()
    api.put.mockRejectedValue(new Error('API PUT /exercises/x/note → 500'))
    renderWorkout()

    const addNote = await screen.findByRole('button', { name: /add note/i })
    await act(async () => { fireEvent.click(addNote) })
    const ta = screen.getByRole('textbox')
    fireEvent.change(ta, { target: { value: 'will not persist' } })
    await act(async () => { fireEvent.blur(ta) })

    // Wave 1.3 changed this copy deliberately: "Failed to save note" named the
    // problem and stopped there, with no next step and no statement about
    // whether the words survived — which, in the old flow, they had not.
    expect(await screen.findByText(/still here, tap to retry/i)).toBeInTheDocument()
  })

  // #229 decision 8: a muted text action, not a button-styled glyph+label.
  it('Add note is a muted text action with no icon and still opens the note editor', async () => {
    api.get.mockReset()
    mockSession()
    renderWorkout()

    const addNote = await screen.findByRole('button', { name: /add note/i })
    expect(addNote.querySelector('svg')).toBeNull()
    expect(addNote.style.color).toBe(hexToRgb(colors.muted))
    expect(addNote.style.fontSize).toBe(type.size.sm)
    expect(addNote.classList.contains('tap-target')).toBe(true)

    await act(async () => { fireEvent.click(addNote) })
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })
})

// ── 2026-10-03 design review, item 1.5 ────────────────────────────────
// The handler used to be
//   onChange={e => onChange(Number.isNaN(parseFloat(e.target.value)) ? min : v)}
// so clearing the field wrote the minimum back on the same keystroke. The
// field could never be empty, and because the caret then sat after the
// refilled digit, the next keystroke appended to it: clear "8", type "5",
// log 15. This is the field a user reaches for mid-set with one hand.
describe('number entry mid-workout (2026-10-03 review 1.5)', () => {
  it('a number field can be cleared instead of refilling its minimum', async () => {
    mockSession()
    renderWorkout()
    await screen.findByText(ex1.name)
    const reps = screen.getAllByRole('spinbutton')[1]
    expect(reps.value).not.toBe('')

    fireEvent.focus(reps)
    fireEvent.change(reps, { target: { value: '' } })
    expect(reps.value).toBe('')

    fireEvent.change(reps, { target: { value: '5' } })
    expect(reps.value).toBe('5')

    fireEvent.blur(reps)
    await waitFor(() => expect(reps).toHaveValue(5))
  })

  it('an emptied field still commits its minimum on blur', async () => {
    mockSession()
    renderWorkout()
    await screen.findByText(ex1.name)
    const reps = screen.getAllByRole('spinbutton')[1]
    const before = Number(reps.value)

    fireEvent.focus(reps)
    fireEvent.change(reps, { target: { value: '' } })
    fireEvent.blur(reps)
    // The floor still applies on the way out — this fix is about not
    // fighting the user mid-entry, not about permitting an invalid value.
    await waitFor(() => expect(reps).toHaveValue(1))
    expect(before).toBeGreaterThanOrEqual(1)
  })
})

// ── Wave 1.1 / 1.6, 2026-10-03 design review ──
describe('Workout: a failed session read must not throw you out of the workout', () => {
  it('stays on the page and says the sets are safe', async () => {
    api.get.mockImplementation(async (path) => {
      if (path === '/sessions/1') throw Object.assign(new Error('offline'), { status: undefined })
      if (path === '/notes') return {}
      throw new Error(`unmocked GET ${path}`)
    })
    renderWorkout()
    expect(await screen.findByText(/Your sets are safe/i)).toBeInTheDocument()
    // The old code was `.catch(() => nav('/'))`, which rendered the "/" route.
    expect(screen.queryByText('home')).not.toBeInTheDocument()
  })
})

describe('Workout: Log Set failure messages match what can actually happen', () => {
  function rejectPost(err) {
    api.get.mockImplementation(async (path) => {
      if (path === '/sessions/1') {
        return { id: 1, workout_day: 'upper_a', date: '2026-07-09', completed: 0,
                 created_at: '2026-07-09 10:00:00', ended_at: null, sets: [] }
      }
      if (path === '/notes') return {}
      if (path === '/progress') return []
      if (path === '/personal-bests') return []
      if (path.startsWith('/exercises/')) return null
      if (path === '/sessions/1/prs') return []
      throw new Error(`unmocked GET ${path}`)
    })
    api.post.mockRejectedValue(err)
  }

  async function logFirstSet() {
    renderWorkout()
    const btn = await screen.findByRole('button', { name: /log set/i })
    fireEvent.click(btn)
  }

  it('a 422 does not tell you to retry — retrying cannot succeed', async () => {
    rejectPost(Object.assign(new Error('API POST → 422'), { status: 422 }))
    await logFirstSet()
    expect(await screen.findByText(/not allowed/i)).toBeInTheDocument()
    expect(screen.queryByText(/tap Log Set again/i)).not.toBeInTheDocument()
  })

  it('a 4xx says the server rejected it, with no retry hint', async () => {
    rejectPost(Object.assign(new Error('API POST → 400'), { status: 400 }))
    await logFirstSet()
    expect(await screen.findByText(/server rejected it/i)).toBeInTheDocument()
  })

  it('a network failure keeps the retry hint but tells you to check first', async () => {
    // No status at all: the 8s AbortSignal.timeout throws a TimeoutError, and the
    // write may or may not have landed. That is the one case where "try again"
    // is honest, and it has to come with the check-your-set-list instruction.
    rejectPost(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }))
    await logFirstSet()
    expect(await screen.findByText(/check the sets above/i)).toBeInTheDocument()
  })

  it('a 401 stays silent — the logout handler is already tearing the screen down', async () => {
    rejectPost(Object.assign(new Error('API POST → 401'), { status: 401 }))
    await logFirstSet()
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(screen.queryByText(/Couldn't save that set/i)).not.toBeInTheDocument()
  })
})

// ── Wave 1.3, 2026-10-03 design review ──
// The old flow closed the editor BEFORE the await, so a failed save destroyed
// the typed words; and because the optimistic update landed first, the note then
// sat on screen looking saved with only a toast saying otherwise.
describe('Workout: a note save that fails', () => {
  beforeEach(() => { vi.clearAllMocks() })

  function mockWithFailedNote(err) {
    api.get.mockImplementation(async (path) => {
      if (path === '/sessions/1') {
        return { id: 1, workout_day: 'upper_a', date: '2026-07-09', completed: 0,
                 created_at: '2026-07-09 10:00:00', ended_at: null, sets: [] }
      }
      if (path === '/notes') return { [ex1.id]: 'old note' }
      if (path === '/progress') return []
      if (path === '/personal-bests') return []
      if (path.startsWith('/exercises/')) return null
      if (path === '/sessions/1/prs') return []
      throw new Error(`unmocked GET ${path}`)
    })
    api.put.mockRejectedValue(err || new Error('offline'))
  }

  async function openEditorAndType(text) {
    renderWorkout()
    await screen.findByText(/old note/)
    fireEvent.click(screen.getByText(/old note/))
    const ta = await screen.findByRole('textbox')
    fireEvent.change(ta, { target: { value: text } })
    fireEvent.blur(ta)
  }

  it('keeps the typed words on screen instead of destroying them', async () => {
    mockWithFailedNote()
    await openEditorAndType('felt heavy, dropped to 60')
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(screen.getByDisplayValue('felt heavy, dropped to 60')).toBeInTheDocument()
  })

  it('marks the note as not saved rather than letting it look saved', async () => {
    mockWithFailedNote()
    await openEditorAndType('belt popped')
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    // Close the editor the way a user would — tap elsewhere — and the marker
    // must still be there.
    fireEvent.blur(screen.getByRole('textbox'))
    await waitFor(() => expect(screen.getByText(/not saved/i)).toBeInTheDocument())
    expect(screen.getByText(/belt popped/)).toBeInTheDocument()
  })

  it('says the note is still here and how to retry', async () => {
    mockWithFailedNote()
    await openEditorAndType('grip gave out')
    expect(await screen.findByText(/still here, tap to retry/i)).toBeInTheDocument()
  })

  it('a successful save shows no not-saved marker', async () => {
    mockWithFailedNote()
    api.put.mockResolvedValue({ ok: true })
    await openEditorAndType('clean set')
    await waitFor(() => expect(screen.getByText(/clean set/)).toBeInTheDocument())
    expect(screen.queryByText(/not saved/i)).not.toBeInTheDocument()
  })
})
