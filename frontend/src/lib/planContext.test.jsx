import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react'
import { StrictMode } from 'react'
import { PlanProvider, usePlan } from './planContext'

const session = vi.hoisted(() => ({ profile: null }))
vi.mock('./session', () => ({ useSession: () => ({ profile: session.profile }) }))
vi.mock('../api', () => ({ api: { get: vi.fn() } }))
import { api } from '../api'

const PLAN_A = {
  upper_a: { id: 'upper_a', name: 'Upper A', tag: 'Push', icon: 'upper', exercises: [{ id: 'bench_press' }] },
}
const PLAN_B = {
  full: { id: 'full', name: 'Full Body', tag: '', icon: 'upper', exercises: [] },
}

function Probe() {
  const { plan, cycle, ready, failed, retry } = usePlan()
  return (
    <div>
      <span data-testid="days">{Object.keys(plan).join(',')}</span>
      <span data-testid="cycle">{cycle.join(',')}</span>
      <span data-testid="ready">{String(ready)}</span>
      <span data-testid="failed">{String(failed)}</span>
      <button onClick={retry}>retry</button>
    </div>
  )
}

const mount = () => render(<PlanProvider><Probe /></PlanProvider>)

beforeEach(() => {
  vi.clearAllMocks()
  session.profile = null
})
afterEach(() => { vi.useRealTimers() })

describe('usePlan outside a provider', () => {
  it('returns an empty, ready plan instead of throwing', () => {
    render(<Probe />)
    expect(screen.getByTestId('days')).toHaveTextContent('')
    expect(screen.getByTestId('cycle')).toHaveTextContent('')
    expect(screen.getByTestId('ready')).toHaveTextContent('true')
    expect(screen.getByTestId('failed')).toHaveTextContent('false')
  })
})

describe('PlanProvider', () => {
  it('does not fetch for nobody, and is ready because nothing is in flight', () => {
    mount()
    expect(api.get).not.toHaveBeenCalled()
    expect(screen.getByTestId('ready')).toHaveTextContent('true')
  })

  it('fetches /plan once for a profile and exposes plan and cycle', async () => {
    session.profile = { id: 1 }
    api.get.mockResolvedValue({ plan: PLAN_A, cycle: ['upper_a'] })
    mount()
    expect(screen.getByTestId('ready')).toHaveTextContent('false')
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(screen.getByTestId('days')).toHaveTextContent('upper_a')
    expect(screen.getByTestId('cycle')).toHaveTextContent('upper_a')
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/plan')
  })

  it('settles ready with an empty plan when the request fails', async () => {
    session.profile = { id: 1 }
    api.get.mockRejectedValue(new Error('API GET /plan → 500'))
    mount()
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(screen.getByTestId('days')).toHaveTextContent('')
    expect(screen.getByTestId('cycle')).toHaveTextContent('')
    expect(screen.getByTestId('failed')).toHaveTextContent('true')
  })

  it('refetches on retry and clears the failure when the answer comes', async () => {
    session.profile = { id: 1 }
    api.get.mockRejectedValueOnce(new Error('API GET /plan → 500'))
    mount()
    await waitFor(() => expect(screen.getByTestId('failed')).toHaveTextContent('true'))
    api.get.mockResolvedValueOnce({ plan: PLAN_A, cycle: ['upper_a'] })
    fireEvent.click(screen.getByText('retry'))
    await waitFor(() => expect(screen.getByTestId('days')).toHaveTextContent('upper_a'))
    expect(screen.getByTestId('failed')).toHaveTextContent('false')
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('gives up waiting after 5s but still swaps a late answer in', async () => {
    vi.useFakeTimers()
    session.profile = { id: 1 }
    let resolve
    api.get.mockReturnValue(new Promise(r => { resolve = r }))
    mount()
    expect(screen.getByTestId('ready')).toHaveTextContent('false')
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(screen.getByTestId('ready')).toHaveTextContent('true')
    expect(screen.getByTestId('days')).toHaveTextContent('')
    expect(screen.getByTestId('failed')).toHaveTextContent('true')
    await act(async () => { resolve({ plan: PLAN_A, cycle: ['upper_a'] }) })
    expect(screen.getByTestId('days')).toHaveTextContent('upper_a')
    expect(screen.getByTestId('failed')).toHaveTextContent('false')
  })

  it('never shows one account the previous account\'s plan', async () => {
    session.profile = { id: 1 }
    api.get.mockResolvedValueOnce({ plan: PLAN_A, cycle: ['upper_a'] })
    const { rerender } = mount()
    await waitFor(() => expect(screen.getByTestId('days')).toHaveTextContent('upper_a'))

    let resolveB
    api.get.mockReturnValueOnce(new Promise(r => { resolveB = r }))
    session.profile = { id: 2 }
    rerender(<PlanProvider><Probe /></PlanProvider>)
    expect(screen.getByTestId('days')).toHaveTextContent('')
    expect(screen.getByTestId('ready')).toHaveTextContent('false')

    await act(async () => { resolveB({ plan: PLAN_B, cycle: ['full'] }) })
    expect(screen.getByTestId('days')).toHaveTextContent('full')
    expect(screen.getByTestId('ready')).toHaveTextContent('true')
  })

  it('drops the plan on sign out', async () => {
    session.profile = { id: 1 }
    api.get.mockResolvedValue({ plan: PLAN_A, cycle: ['upper_a'] })
    const { rerender } = mount()
    await waitFor(() => expect(screen.getByTestId('days')).toHaveTextContent('upper_a'))
    session.profile = null
    rerender(<PlanProvider><Probe /></PlanProvider>)
    expect(screen.getByTestId('days')).toHaveTextContent('')
    expect(screen.getByTestId('ready')).toHaveTextContent('true')
  })

  it('does not let a stale response overwrite the current account\'s plan', async () => {
    session.profile = { id: 1 }
    let resolveA
    api.get.mockReturnValueOnce(new Promise(r => { resolveA = r }))
    const { rerender } = mount()
    api.get.mockResolvedValueOnce({ plan: PLAN_B, cycle: ['full'] })
    session.profile = { id: 2 }
    rerender(<PlanProvider><Probe /></PlanProvider>)
    await waitFor(() => expect(screen.getByTestId('days')).toHaveTextContent('full'))
    await act(async () => { resolveA({ plan: PLAN_A, cycle: ['upper_a'] }) })
    expect(screen.getByTestId('days')).toHaveTextContent('full')
  })

  it('behaves under StrictMode double-mounting', async () => {
    session.profile = { id: 1 }
    api.get.mockResolvedValue({ plan: PLAN_A, cycle: ['upper_a'] })
    render(<StrictMode><PlanProvider><Probe /></PlanProvider></StrictMode>)
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(screen.getByTestId('days')).toHaveTextContent('upper_a')
  })
})
