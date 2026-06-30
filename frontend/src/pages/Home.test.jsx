import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StartOrResumeButton } from './Home'

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
