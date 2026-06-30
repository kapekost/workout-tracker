import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ActiveSessionProvider, useActiveSession } from './activeSession'

vi.mock('../api', () => ({ api: { get: vi.fn(), delete: vi.fn() } }))
import { api } from '../api'

function Probe() {
  const { active, ready, discard } = useActiveSession()
  return (
    <div>
      <span data-testid="active">{active ? active.id : 'none'}</span>
      <span data-testid="ready">{String(ready)}</span>
      <button onClick={() => discard(active.id)}>discard</button>
    </div>
  )
}

beforeEach(() => { vi.clearAllMocks() })

describe('ActiveSessionProvider', () => {
  it('exposes the incomplete session after mount', async () => {
    api.get.mockResolvedValue([{ id: 7, completed: 0 }])
    render(<ActiveSessionProvider><Probe /></ActiveSessionProvider>)
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('7'))
  })

  it('ready becomes true after the mount fetch resolves', async () => {
    api.get.mockResolvedValue([])
    render(<ActiveSessionProvider><Probe /></ActiveSessionProvider>)
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
  })

  it('discard deletes then refreshes to no active', async () => {
    api.get.mockResolvedValueOnce([{ id: 7, completed: 0 }])
    api.delete.mockResolvedValue({ deleted: true })
    api.get.mockResolvedValueOnce([{ id: 7, completed: 1 }])
    render(<ActiveSessionProvider><Probe /></ActiveSessionProvider>)
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('7'))
    fireEvent.click(screen.getByText('discard'))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/sessions/7'))
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('none'))
  })
})
