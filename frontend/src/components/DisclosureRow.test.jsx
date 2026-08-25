import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createRef } from 'react'
import DisclosureRow from './DisclosureRow'

describe('DisclosureRow', () => {
  it('shows the header and the ∨ glyph, and hides children, when closed', () => {
    render(
      <DisclosureRow header={<span>Bench Press</span>} isOpen={false} onToggle={() => {}}>
        <p>Set details</p>
      </DisclosureRow>
    )
    expect(screen.getByText('Bench Press')).toBeInTheDocument()
    expect(screen.getByText('∨')).toBeInTheDocument()
    expect(screen.queryByText('Set details')).not.toBeInTheDocument()
  })

  it('shows children and flips to the ∧ glyph when open', () => {
    render(
      <DisclosureRow header={<span>Bench Press</span>} isOpen={true} onToggle={() => {}}>
        <p>Set details</p>
      </DisclosureRow>
    )
    expect(screen.getByText('Set details')).toBeInTheDocument()
    expect(screen.getByText('∧')).toBeInTheDocument()
    expect(screen.queryByText('∨')).not.toBeInTheDocument()
  })

  it('calls onToggle when the header row is clicked', () => {
    const onToggle = vi.fn()
    render(
      <DisclosureRow header={<span>Bench Press</span>} isOpen={false} onToggle={onToggle}>
        <p>Set details</p>
      </DisclosureRow>
    )
    fireEvent.click(screen.getByText('Bench Press'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('forwards a ref to the outer card element, for scroll-into-view anchoring', () => {
    const ref = createRef()
    render(
      <DisclosureRow ref={ref} header={<span>X</span>} isOpen={false} onToggle={() => {}}>
        <p>Y</p>
      </DisclosureRow>
    )
    expect(ref.current).toBeInstanceOf(HTMLElement)
    expect(ref.current.className).toBe('card')
  })

  it('uses a caller-supplied bodyPadding instead of the default', () => {
    render(
      <DisclosureRow header={<span>X</span>} isOpen={true} onToggle={() => {}} bodyPadding="16px">
        <p>Y</p>
      </DisclosureRow>
    )
    expect(screen.getByText('Y').parentElement.style.padding).toBe('16px')
  })
})
