import { render } from '@testing-library/react'
import Toast from './Toast'

describe('Toast live region', () => {
  // The reason this component always mounts its container: a live region only
  // reliably announces if it already exists and empty. The first version of
  // this fix returned null when there was no toast, so the region was inserted
  // into the DOM in the same React commit as its text — correct markup in the
  // wrong place, and VoiceOver on iOS does not announce that.
  it('keeps the region in the DOM even with no toast', () => {
    const { container } = render(<Toast toast={null} />)
    const region = container.querySelector('[role="status"]')
    expect(region).toBeInTheDocument()
    expect(region).toBeEmptyDOMElement()
  })

  it('marks an empty region polite and an error one assertive', () => {
    const { container, rerender } = render(<Toast toast={null} />)
    expect(container.querySelector('[role="status"]')).toHaveAttribute('aria-live', 'polite')

    rerender(<Toast toast={{ message: 'boom', type: 'error' }} />)
    expect(container.querySelector('[role="alert"]')).toHaveAttribute('aria-live', 'assertive')
  })

  it('renders the message and the error class', () => {
    const { container } = render(<Toast toast={{ message: 'PR! 100kg', type: 'ok' }} />)
    const region = container.querySelector('[role="status"]')
    expect(region).toHaveTextContent('PR! 100kg')
    expect(region.className).toContain('toast')
    expect(region.className).not.toContain('error')
  })

  it('adds the error class for an error toast', () => {
    const { container } = render(<Toast toast={{ message: 'Failed to save note', type: 'error' }} />)
    const region = container.querySelector('[role="alert"]')
    expect(region.className).toContain('toast')
    expect(region.className).toContain('error')
  })

  it('applies no toast class while empty, so nothing is visible', () => {
    const { container } = render(<Toast toast={null} />)
    // The class is what gives the element its position/size; without it an
    // always-mounted region would occupy layout when there is nothing to say.
    expect(container.querySelector('[role="status"]').className).toBe('')
  })

  it('handles a missing toast prop without throwing', () => {
    expect(() => render(<Toast />)).not.toThrow()
  })
})