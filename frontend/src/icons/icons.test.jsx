import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { IconHome, IconCheck, IconTrash, IconPencil, IconClock } from './index'

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
    expect(render(<IconPencil className="my-class" />).container.querySelector('svg').getAttribute('class')).toBe('my-class')
  })

  // A handful of icons (Clock, History/Clipboard, day badges, the barbell app
  // mark) are baked PNGs instead of SVGs -- see #211: their opacity-accent
  // layers were invisible when drawn over an identically-colored base, a bug
  // that only a real two-tone raster (not a single-currentColor glyph) fixes.
  describe('PNG-backed icons', () => {
    it('renders an img at the requested size, aria-hidden, non-recolorable via currentColor', () => {
      const { container } = render(<IconClock size={24} />)
      const img = container.querySelector('img')
      expect(img.getAttribute('width')).toBe('24')
      expect(img.getAttribute('height')).toBe('24')
      expect(img.getAttribute('aria-hidden')).toBe('true')
    })
    it('uses opacity, not color, for its dimmed/inactive state', () => {
      const img = render(<IconClock opacity={0.5} />).container.querySelector('img')
      expect(img.style.opacity).toBe('0.5')
    })
    it('spreads extra props onto the root img', () => {
      const img = render(<IconClock className="my-class" />).container.querySelector('img')
      expect(img.getAttribute('class')).toBe('my-class')
    })
    // Regression: a plain `display: 'block'` img generates its own block
    // formatting box, so when it sits next to inline text in a container
    // that isn't itself flex (TimerBar's .session-clock, History.jsx's
    // session-duration span), the sibling text drops onto its own line
    // instead of following inline -- caught by a Codex review comment on
    // PR #213 after merge, missed by a zoomed-screenshot check that only
    // verified the icon looked legible, not where it sat relative to text.
    it('is inline-level so it sits beside adjacent text without a flex wrapper', () => {
      const img = render(<IconClock />).container.querySelector('img')
      expect(img.style.display).toBe('inline-block')
    })
  })
})
