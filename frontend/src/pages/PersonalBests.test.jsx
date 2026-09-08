import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PersonalBests from './PersonalBests'
import { ALL_EXERCISES } from '../data/workoutPlan'

vi.mock('../api', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
import { api } from '../api'

function renderPage() {
  return render(<MemoryRouter><PersonalBests /></MemoryRouter>)
}

beforeEach(() => { vi.clearAllMocks() })

describe('PersonalBests page', () => {
  it('lists existing entries grouped by exercise', async () => {
    api.get.mockResolvedValue([
      { id: 1, exercise_id: 'bench_press', exercise_name: 'Bench Press',
        weight_kg: 100, reps: 3, achieved_year: 2023, achieved_note: null },
    ])
    renderPage()
    await screen.findByText('Bench Press')
    expect(screen.getByText('100kg × 3')).toBeInTheDocument()
  })

  it('shows an empty state with no entries', async () => {
    api.get.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No historical PBs logged yet.')).toBeInTheDocument()
  })

  it('submitting the form posts and appends the new entry', async () => {
    api.get.mockResolvedValue([])
    api.post.mockResolvedValue({
      id: 2, exercise_id: 'bench_press', exercise_name: 'Bench Press',
      weight_kg: 120, reps: 1, achieved_year: 2021, achieved_note: null,
    })
    renderPage()
    await screen.findByText('No historical PBs logged yet.')
    // The form lives behind the "+ Add" disclosure (item 19) — open it first.
    fireEvent.click(screen.getByRole('button', { name: /^\+ Add(?! Personal)/ }))
    fireEvent.click(screen.getByRole('button', { name: /add personal best/i }))
    // Verify the full six-field form-to-payload mapping, not just "was called" —
    // the default form state (first exercise alphabetically, 20kg, 1 rep,
    // current year, no note).
    const firstExercise = ALL_EXERCISES[0]
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/personal-bests', {
      exercise_id: firstExercise.id,
      exercise_name: firstExercise.name,
      weight_kg: 20,
      reps: 1,
      achieved_year: new Date().getFullYear(),
      achieved_note: null,
    }))
    await screen.findByText('120kg × 1')
  })

  it('a single tap arms the confirm state but does not delete', async () => {
    api.get.mockResolvedValue([
      { id: 1, exercise_id: 'bench_press', exercise_name: 'Bench Press',
        weight_kg: 100, reps: 3, achieved_year: 2023, achieved_note: null },
    ])
    api.delete.mockResolvedValue({ deleted: true })
    renderPage()
    await screen.findByText('100kg × 3')
    fireEvent.click(screen.getByRole('button', { name: 'delete personal best 1' }))
    expect(api.delete).not.toHaveBeenCalled()
    expect(screen.getByText('100kg × 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'confirm delete personal best 1' })).toBeInTheDocument()
  })

  it('a second tap on the armed button deletes the entry', async () => {
    api.get.mockResolvedValue([
      { id: 1, exercise_id: 'bench_press', exercise_name: 'Bench Press',
        weight_kg: 100, reps: 3, achieved_year: 2023, achieved_note: null },
    ])
    api.delete.mockResolvedValue({ deleted: true })
    renderPage()
    await screen.findByText('100kg × 3')
    fireEvent.click(screen.getByRole('button', { name: 'delete personal best 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'confirm delete personal best 1' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/personal-bests/1'))
    await waitFor(() => expect(screen.queryByText('100kg × 3')).not.toBeInTheDocument())
  })

  it('shows a specific message for a duplicate (409) submission', async () => {
    api.get.mockResolvedValue([])
    api.post.mockRejectedValue(new Error('API POST /personal-bests → 409'))
    renderPage()
    await screen.findByText('No historical PBs logged yet.')
    fireEvent.click(screen.getByRole('button', { name: /^\+ Add(?! Personal)/ }))
    fireEvent.click(screen.getByRole('button', { name: /add personal best/i }))
    await screen.findByText(/already logged this exact PB/i)
  })

  it('falls back to the generic message for a non-409 failure', async () => {
    api.get.mockResolvedValue([])
    api.post.mockRejectedValue(new Error('API POST /personal-bests → 500'))
    renderPage()
    await screen.findByText('No historical PBs logged yet.')
    fireEvent.click(screen.getByRole('button', { name: /^\+ Add(?! Personal)/ }))
    fireEvent.click(screen.getByRole('button', { name: /add personal best/i }))
    await screen.findByText(/failed to save — check the values/i)
  })
})

// 2026-09-06 UI review, item 19: the add form used to sit above the list,
// competing with it for attention on every visit even though this page is
// visited to read PBs far more often than to add one. It now lives behind a
// "+ Add" disclosure, closed by default, reusing DisclosureRow.
describe('PersonalBests add-form disclosure — item 19', () => {
  it('starts closed, with the list visible and the form hidden', async () => {
    api.get.mockResolvedValue([
      { id: 1, exercise_id: 'bench_press', exercise_name: 'Bench Press',
        weight_kg: 100, reps: 3, achieved_year: 2023, achieved_note: null },
    ])
    renderPage()
    await screen.findByText('Bench Press')
    const toggle = screen.getByRole('button', { name: /^\+ Add(?! Personal)/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // The body (including the "Exercise" field label) only renders while open.
    expect(screen.queryByText('Exercise')).not.toBeInTheDocument()
  })

  it('opening the disclosure reveals the form, keeping the list in place', async () => {
    api.get.mockResolvedValue([
      { id: 1, exercise_id: 'bench_press', exercise_name: 'Bench Press',
        weight_kg: 100, reps: 3, achieved_year: 2023, achieved_note: null },
    ])
    renderPage()
    await screen.findByText('Bench Press')
    fireEvent.click(screen.getByRole('button', { name: /^\+ Add(?! Personal)/ }))
    expect(screen.getByRole('button', { name: /^\+ Add(?! Personal)/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /add personal best/i })).toBeInTheDocument()
    // The list is still rendered and precedes the disclosure in document
    // order. "Bench Press" now matches twice once the form is open (the
    // list heading, and the exercise <select>'s own option) -- the list
    // heading is the first match since it renders before the disclosure.
    const list = screen.getAllByText('Bench Press')[0]
    const form = screen.getByRole('button', { name: /add personal best/i })
    expect(list.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the disclosure is available even with no PBs logged yet', async () => {
    api.get.mockResolvedValue([])
    renderPage()
    await screen.findByText('No historical PBs logged yet.')
    expect(screen.getByRole('button', { name: /^\+ Add(?! Personal)/ })).toBeInTheDocument()
  })
})
