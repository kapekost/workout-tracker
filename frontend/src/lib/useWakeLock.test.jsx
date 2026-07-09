import { renderHook, act, waitFor } from '@testing-library/react'
import { useWakeLock } from './useWakeLock'

function makeWakeLockMock() {
  const locks = []
  const request = vi.fn(async () => {
    const listeners = {}
    const lock = {
      addEventListener: (ev, fn) => { listeners[ev] = fn },
      release: vi.fn(async () => { listeners.release?.() }),
      // what the browser does on tab hide: releases and fires the event
      _autoRelease: () => listeners.release?.(),
    }
    locks.push(lock)
    return lock
  })
  return { request, locks }
}

describe('useWakeLock', () => {
  let ctl
  beforeEach(() => {
    ctl = makeWakeLockMock()
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: ctl.request }, configurable: true,
    })
  })
  afterEach(() => { delete navigator.wakeLock })

  it('acquires a screen lock when active', async () => {
    const { result } = renderHook(() => useWakeLock(true))
    await waitFor(() => expect(result.current.held).toBe(true))
    expect(ctl.request).toHaveBeenCalledWith('screen')
  })

  it('re-acquires after the browser auto-releases and the tab is visible again', async () => {
    const { result } = renderHook(() => useWakeLock(true))
    await waitFor(() => expect(result.current.held).toBe(true))

    act(() => { ctl.locks[0]._autoRelease() }) // tab hidden → browser drops the lock
    expect(result.current.held).toBe(false)

    act(() => { document.dispatchEvent(new Event('visibilitychange')) }) // back to the tab
    await waitFor(() => expect(result.current.held).toBe(true))
    expect(ctl.request).toHaveBeenCalledTimes(2)
  })

  it('releases on unmount', async () => {
    const { result, unmount } = renderHook(() => useWakeLock(true))
    await waitFor(() => expect(result.current.held).toBe(true))
    unmount()
    expect(ctl.locks[0].release).toHaveBeenCalled()
  })
})
