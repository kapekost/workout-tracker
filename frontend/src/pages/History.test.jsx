import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import History, { SessionDetail } from './History'
import { PLAN, CYCLE } from '../data/workoutPlan'

vi.mock('../lib/planContext', () => ({ usePlan: () => ({ plan: PLAN, cycle: CYCLE, ready: true }) }))

vi.mock('../api', () => ({ api: { get: vi.fn(), delete: vi.fn() } }))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))
import { api } from '../api'

function renderHistory() {
  return render(<MemoryRouter><History /></MemoryRouter>)
}

describe('SessionDetail delete button', () => {
  it('shows the delete button even when the session has no sets', () => {
    render(<SessionDetail detail={{ sets: [] }} confirmId={null} sessionId={15} onDelete={vi.fn()} />)
    expect(screen.getByText('No sets logged in this session.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete session' })).toBeInTheDocument()
  })

  it('shows the delete button when the session has sets', () => {
    const detail = { sets: [{ id: 1, exercise_name: 'Bench Press', set_number: 1, weight_kg: 80, reps: 8 }] }
    render(<SessionDetail detail={detail} confirmId={null} sessionId={9} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Delete session' })).toBeInTheDocument()
  })

  it('shows the confirm label when confirmId matches', () => {
    render(<SessionDetail detail={{ sets: [] }} confirmId={15} sessionId={15} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Tap again to confirm' })).toBeInTheDocument()
  })
})

// ── Wave 1.1, 2026-10-03 design review ──
describe('History when the read fails', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('does not claim you have zero sessions', async () => {
    api.get.mockRejectedValue(new Error('offline'))
    renderHistory()
    await screen.findByRole('alert')
    expect(screen.queryByText(/No sessions yet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/0 sessions logged/i)).not.toBeInTheDocument()
  })

  it('says nothing was lost and offers a retry', async () => {
    api.get.mockRejectedValue(new Error('offline'))
    renderHistory()
    expect(await screen.findByText(/Nothing was lost/i)).toBeInTheDocument()
    api.get.mockResolvedValueOnce([{ id: 5, workout_day: 'upper_a', date: '2026-09-01', completed: 1, sets: [] }])
    fireEvent.click(screen.getByRole('button', { name: /Try again/i }))
    expect(await screen.findByText(/1 session logged/i)).toBeInTheDocument()
  })
})
