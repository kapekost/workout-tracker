import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StartOrResumeButton, planForDay, VersionStamp, lastTrainedByDay } from './Home'
import { PLAN } from '../data/workoutPlan'

describe('planForDay', () => {
  it('returns the real PLAN entry for a known day', () => {
    expect(planForDay('upper_a')).toBe(PLAN.upper_a)
  })

  it('returns a fallback with name Workout and empty exercises for an unknown day', () => {
    const result = planForDay('bogus_day')
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
    expect(lastTrainedByDay(sessions)).toEqual({
      upper_a: '2026-08-12', lower_a: '2026-08-10',
    })
  })

  it('ignores in-progress sessions', () => {
    const sessions = [
      { workout_day: 'upper_a', date: '2026-08-12', completed: 0 },
      { workout_day: 'upper_a', date: '2026-08-05', completed: 1 },
    ]
    expect(lastTrainedByDay(sessions)).toEqual({ upper_a: '2026-08-05' })
  })

  it('handles no sessions', () => {
    expect(lastTrainedByDay([])).toEqual({})
    expect(lastTrainedByDay(null)).toEqual({})
  })

  it('ignores sessions whose workout_day is not a plan day', () => {
    expect(lastTrainedByDay([{ workout_day: 'bogus', date: '2026-08-12', completed: 1 }]))
      .toEqual({})
  })
})
