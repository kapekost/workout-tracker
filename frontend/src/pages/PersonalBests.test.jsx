import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PersonalBests from './PersonalBests'

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
    fireEvent.click(screen.getByRole('button', { name: /add personal best/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    await screen.findByText('120kg × 1')
  })

  it('delete removes the entry from the list', async () => {
    api.get.mockResolvedValue([
      { id: 1, exercise_id: 'bench_press', exercise_name: 'Bench Press',
        weight_kg: 100, reps: 3, achieved_year: 2023, achieved_note: null },
    ])
    api.delete.mockResolvedValue({ deleted: true })
    renderPage()
    await screen.findByText('100kg × 3')
    fireEvent.click(screen.getByRole('button', { name: 'delete personal best 1' }))
    await waitFor(() => expect(screen.queryByText('100kg × 3')).not.toBeInTheDocument())
  })
})
