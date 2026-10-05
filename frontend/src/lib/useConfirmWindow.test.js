import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useConfirmWindow } from './useConfirmWindow'

describe('useConfirmWindow', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('arms on the first call and confirms on the second', () => {
    const { result } = renderHook(() => useConfirmWindow())

    act(() => { expect(result.current.confirm(7)).toBe(false) })
    expect(result.current.armedId).toBe(7)

    act(() => { expect(result.current.confirm(7)).toBe(true) })
    expect(result.current.armedId).toBe(null)
  })

  it('re-arms rather than confirming when a different id is tapped', () => {
    const { result } = renderHook(() => useConfirmWindow())

    act(() => { result.current.confirm(7) })
    act(() => { expect(result.current.confirm(8)).toBe(false) })

    expect(result.current.armedId).toBe(8)
  })

  it('disarms itself when the window elapses', () => {
    const { result } = renderHook(() => useConfirmWindow())
    act(() => { result.current.confirm(7) })

    act(() => { vi.advanceTimersByTime(3000) })

    expect(result.current.armedId).toBe(null)
  })

  it('does not disarm a row armed after the window started', () => {
    const { result } = renderHook(() => useConfirmWindow())

    act(() => { result.current.confirm(7) })
    act(() => { vi.advanceTimersByTime(2000) })
    act(() => { result.current.confirm(8) })
    // The first window's expiry must not disarm the second row: only one timer
    // exists, and re-arming replaced it.
    act(() => { vi.advanceTimersByTime(1000) })

    expect(result.current.armedId).toBe(8)
  })

  // The actual bug (#262): the callback outlived the component, so it called a
  // state setter after unmount. Vitest reports that against whichever test is
  // running at the time, which is how an unrelated file went red.
  it('clears the pending timer on unmount instead of updating a dead component', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { result, unmount } = renderHook(() => useConfirmWindow())

    act(() => { result.current.confirm(7) })
    unmount()

    expect(clearSpy).toHaveBeenCalled()
    // Nothing left to fire into: advancing past the window is inert.
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
    clearSpy.mockRestore()
  })

  it('leaves no timer pending after a confirming tap', () => {
    const { result } = renderHook(() => useConfirmWindow())

    act(() => { result.current.confirm(7) })
    act(() => { result.current.confirm(7) })

    expect(vi.getTimerCount()).toBe(0)
  })

  it('disarms on demand', () => {
    const { result } = renderHook(() => useConfirmWindow())

    act(() => { result.current.confirm(7) })
    act(() => { result.current.disarm() })

    expect(result.current.armedId).toBe(null)
    expect(vi.getTimerCount()).toBe(0)
  })
})