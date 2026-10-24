import { describe, it, expect, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import ChangelogDialog from './ChangelogDialog'

describe('ChangelogDialog history', () => {
  it('closes on popstate', () => {
    const onClose = vi.fn()
    render(<ChangelogDialog entries={[]} onClose={onClose} />)
    act(() => { history.replaceState(null, ''); window.dispatchEvent(new PopStateEvent('popstate')) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
