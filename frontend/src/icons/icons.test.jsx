import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { IconHome, IconCheck, IconTrash, IconPencil, IconClock, IconArrowTrendingUp, IconClipboardList, IconDayUpper, IconDayLower, IconPlay, IconPause, IconRefresh } from './index'

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

  // 2026-09-27 mobile icon audit: a source PNG wider than it is tall (aspect
  // ratio > 1) loses height under object-fit: contain in a size x size box --
  // the box's own height is capped to whatever's left after the wide image
  // fills the width. Next to a same-size SVG (which fills its full square)
  // or a taller-than-wide PNG (which already renders at full box height),
  // that reads as visibly smaller/weaker at the identical size prop. Real
  // instances found live: IconArrowTrendingUp/IconClipboardList next to
  // IconHome in NavBar.jsx, and IconDayUpper next to IconDayLower in
  // DayIcon.jsx's History-list rows. Fixed with a paint-only
  // `transform: scale()` that restores full height without changing the
  // element's own width/height attributes or its layout footprint anywhere
  // it's used -- these three assertions guard that fix.
  describe('aspect-corrected wide PNG icons', () => {
    it('IconArrowTrendingUp keeps its size x size box but scales its content up to full height', () => {
      const img = render(<IconArrowTrendingUp size={22} />).container.querySelector('img')
      expect(img.getAttribute('width')).toBe('22')
      expect(img.getAttribute('height')).toBe('22')
      expect(img.style.transform).toBe(`scale(${164 / 114})`)
    })
    it('IconClipboardList keeps its size x size box but scales its content up to full height', () => {
      const img = render(<IconClipboardList size={22} />).container.querySelector('img')
      expect(img.getAttribute('width')).toBe('22')
      expect(img.getAttribute('height')).toBe('22')
      expect(img.style.transform).toBe(`scale(${164 / 106})`)
    })
    it('IconDayUpper keeps its size x size box but scales its content up to full height', () => {
      const img = render(<IconDayUpper size={20} />).container.querySelector('img')
      expect(img.getAttribute('width')).toBe('20')
      expect(img.getAttribute('height')).toBe('20')
      expect(img.style.transform).toBe(`scale(${105 / 80})`)
    })
    // IconDayLower's source is taller than wide (71x81) so it already fills
    // its full box height under plain object-fit: contain -- no correction
    // needed or applied. This guards against a future edit accidentally
    // adding one, which would overflow it past IconDayUpper's now-matched
    // height instead of keeping the two visually level.
    it('IconDayLower is left uncorrected -- its source already fills full height', () => {
      const img = render(<IconDayLower size={20} />).container.querySelector('img')
      expect(img.style.transform).toBe('')
    })
  })

  // #209: TimerBar's pause/resume, ExerciseDetails' video-play glyph, and
  // VersionBadge's refresh glyph were plain Unicode characters (outside
  // #152's own emoji-range grep, so missed by that sweep) instead of
  // vendored icons. Authored in the current fill/stroke house style
  // (IconPlus/IconCheck's double-layer look), not Heroicons -- #209's body
  // named Heroicons, but that predates the #212 rewrite off Heroicons onto
  // this custom style.
  describe('new icons (#209)', () => {
    it('IconPlay and IconPause render fill-based svgs at the requested size', () => {
      const play = render(<IconPlay size={14} />).container.querySelector('svg')
      const pause = render(<IconPause size={14} />).container.querySelector('svg')
      expect(play.getAttribute('width')).toBe('14')
      expect(pause.getAttribute('width')).toBe('14')
      expect(play.outerHTML).toContain('currentColor')
      expect(pause.outerHTML).toContain('currentColor')
    })
    it('IconRefresh renders a stroke-based svg at the requested size', () => {
      const svg = render(<IconRefresh size={12} />).container.querySelector('svg')
      expect(svg.getAttribute('width')).toBe('12')
      expect(svg.getAttribute('stroke')).toBe('currentColor')
    })
  })
})
