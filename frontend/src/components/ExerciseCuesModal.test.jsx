import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ExerciseCuesModal from './ExerciseCuesModal'

vi.mock('../lib/demos', () => ({ getDemoFrames: () => null }))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))

const ex = {
  id: 'bench_press', name: 'Bench Press', alt: 'or Dumbbell Press',
  sets: 3, repsLow: 6, repsHigh: 10, muscles: ['Chest'],
  ytUrl: 'https://example.com', cues: ['Retract shoulder blades'],
}

beforeEach(() => vi.clearAllMocks())

describe('ExerciseCuesModal', () => {
  it('renders as a labeled dialog', () => {
    render(<ExerciseCuesModal ex={ex} color="#6ee7b7" onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.getAttribute('aria-label')).toContain('Bench Press')
  })

  it('Escape calls onClose', () => {
    const onClose = vi.fn()
    render(<ExerciseCuesModal ex={ex} color="#6ee7b7" onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('clicking the backdrop calls onClose', () => {
    const onClose = vi.fn()
    render(<ExerciseCuesModal ex={ex} color="#6ee7b7" onClose={onClose} />)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalled()
  })

  it('clicking inside the sheet does not call onClose', () => {
    const onClose = vi.fn()
    render(<ExerciseCuesModal ex={ex} color="#6ee7b7" onClose={onClose} />)
    fireEvent.click(screen.getByText('Bench Press'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('the close button calls onClose', () => {
    const onClose = vi.fn()
    render(<ExerciseCuesModal ex={ex} color="#6ee7b7" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    expect(onClose).toHaveBeenCalled()
  })
})
