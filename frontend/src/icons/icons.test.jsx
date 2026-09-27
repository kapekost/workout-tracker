import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { IconHome, IconCheck, IconTrash, IconBarbell } from './index'

describe('icon components', () => {
  it('renders an svg at the default 20px size, colored via currentColor', () => {
    const { container } = render(<IconHome />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg.getAttribute('height')).toBe('20')
    // Icons are fill-based (with a couple of stroke-based exceptions like
    // Check/XMark) so currentColor can land on the root svg or on individual
    // shapes, depending on the icon.
    expect(svg.outerHTML).toContain('currentColor')
  })
  it('is aria-hidden by default', () => {
    expect(render(<IconCheck />).container.querySelector('svg').getAttribute('aria-hidden')).toBe('true')
  })
  it('accepts a custom size', () => {
    const svg = render(<IconTrash size={16} />).container.querySelector('svg')
    expect(svg.getAttribute('width')).toBe('16')
  })
  it('spreads extra props onto the root svg', () => {
    expect(render(<IconBarbell className="my-class" />).container.querySelector('svg').getAttribute('class')).toBe('my-class')
  })
})
