import { StrictMode } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import useBackToClose from './useBackToClose'

function Probe({ onClose }) { useBackToClose(onClose); return null }

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('useBackToClose', () => {
  it('pushes on open and closes on popstate without going back again', () => {
    vi.useFakeTimers()
    const onClose = vi.fn(), push = vi.spyOn(history, 'pushState'), back = vi.spyOn(history, 'back').mockImplementation(() => {})
    const { unmount } = render(<Probe onClose={onClose} />)
    expect(push).toHaveBeenCalledTimes(1)
    act(() => { history.replaceState(null, ''); window.dispatchEvent(new PopStateEvent('popstate')) })
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
    vi.runAllTimers()
    expect(back).not.toHaveBeenCalled()
  })

  it('goes back when closed by other means', () => {
    vi.useFakeTimers()
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    render(<Probe onClose={() => {}} />).unmount()
    vi.runAllTimers()
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('pushes once and never goes back under the StrictMode double mount', () => {
    vi.useFakeTimers()
    const onClose = vi.fn(), push = vi.spyOn(history, 'pushState'), back = vi.spyOn(history, 'back').mockImplementation(() => {})
    render(<StrictMode><Probe onClose={onClose} /></StrictMode>)
    vi.runAllTimers()
    expect(push).toHaveBeenCalledTimes(1)
    expect(back).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
