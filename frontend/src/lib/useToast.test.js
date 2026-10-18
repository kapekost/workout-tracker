import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useToast } from './useToast'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useToast', () => {
  it('starts with no toast', () => {
    const { result } = renderHook(() => useToast())
    expect(result.current.toast).toBeNull()
  })

  it('shows a toast with the given message and a default type', () => {
    const { result } = renderHook(() => useToast())
    act(() => result.current.showToast('Saved'))
    expect(result.current.toast).toEqual({ message: 'Saved', type: 'default' })
  })

  it('passes an explicit type through', () => {
    const { result } = renderHook(() => useToast())
    act(() => result.current.showToast('Failed to save', 'error'))
    expect(result.current.toast).toEqual({ message: 'Failed to save', type: 'error' })
  })

  it('auto-clears after 4000ms', () => {
    const { result } = renderHook(() => useToast())
    act(() => result.current.showToast('Saved'))
    act(() => { vi.advanceTimersByTime(4000) })
    expect(result.current.toast).toBeNull()
  })

  it('does not clear before 4000ms has elapsed', () => {
    const { result } = renderHook(() => useToast())
    act(() => result.current.showToast('Saved'))
    act(() => { vi.advanceTimersByTime(3999) })
    expect(result.current.toast).not.toBeNull()
  })

  it('a second call resets the timer instead of being cut short by the first', () => {
    const { result } = renderHook(() => useToast())
    act(() => result.current.showToast('First'))
    act(() => { vi.advanceTimersByTime(3000) }) // first timer has 1000ms left to run
    act(() => result.current.showToast('Second'))
    act(() => { vi.advanceTimersByTime(3000) }) // past the first call's original deadline
    // The first call's timeout must have been cancelled — otherwise it would
    // have fired here and cleared the second toast early.
    expect(result.current.toast).toEqual({ message: 'Second', type: 'default' })
    act(() => { vi.advanceTimersByTime(1000) }) // now the second call's own 4000ms is up
    expect(result.current.toast).toBeNull()
  })
})
