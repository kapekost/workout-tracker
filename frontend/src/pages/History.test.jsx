import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionDetail } from './History'

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
