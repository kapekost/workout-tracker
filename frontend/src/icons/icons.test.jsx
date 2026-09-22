import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { IconHome, IconCheck, IconTrash, IconBarbell } from './index'

describe('icon components', () => {
  it('renders an svg at the default 20px size with currentColor stroke', () => {
    const { container } = render(<IconHome />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg.getAttribute('height')).toBe('20')
    expect(svg.getAttribute('stroke')).toBe('currentColor')
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
