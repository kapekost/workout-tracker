import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StartOrResumeButton, planForDay, VersionStamp } from './Home'
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
