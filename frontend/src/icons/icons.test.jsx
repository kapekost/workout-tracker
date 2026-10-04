import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { readdirSync, readFileSync } from 'fs'
import { resolve, join } from 'path'
import { IconHome, IconCheck, IconTrash, IconPencil, IconClock, IconArrowTrendingUp, IconClipboardList, IconDayUpper, IconDayLower, IconPlay, IconPause, IconRefresh, IconBarbell, IconClipboardDocumentList } from './index'
import PngIcon from './PngIcon'

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
  // that reads as visibly smaller/weaker at the identical size prop. A real
  // instance still here: IconDayUpper next to IconDayLower in DayIcon.jsx's
  // History-list rows. (IconArrowTrendingUp and IconClipboardList had the
  // same symptom, but as of the 2026-09-27 nav icon redesign they're flat
  // SVGs, not PNGs, so the aspect-scale hack no longer applies to them --
  // see the 'nav icon SVG redesign' describe block below instead.) Fixed
  // with a paint-only `transform: scale()` that restores full height
  // without changing the element's own width/height attributes or its
  // layout footprint anywhere it's used -- this assertion guards that fix.
  describe('aspect-corrected wide PNG icons', () => {
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

  // 2026-09-27 nav icon redesign: IconArrowTrendingUp and IconClipboardList
  // used to be PNG "sticker" icons (see the removed cases in the
  // 'aspect-corrected wide PNG icons' block above) with baked-in padding and
  // no real recolor -- their `color` prop was silently dropped, so
  // NavBar.jsx's active/inactive color swap was a no-op on them (fixed
  // alongside NavBar.test.jsx). Redrawn as plain SVGs in the same house
  // style as the rest of the set: IconClipboardList is fill-based like
  // IconHome/IconTrophy, IconArrowTrendingUp is stroke-based like IconCheck.
  describe('nav icon SVG redesign (2026-09-27)', () => {
    it('IconClipboardList renders a fill-based svg at the requested size, aria-hidden', () => {
      const svg = render(<IconClipboardList size={22} />).container.querySelector('svg')
      expect(svg.getAttribute('width')).toBe('22')
      expect(svg.getAttribute('height')).toBe('22')
      expect(svg.getAttribute('aria-hidden')).toBe('true')
      expect(svg.outerHTML).toContain('currentColor')
    })
    it('IconArrowTrendingUp renders a stroke-based svg at the requested size, aria-hidden', () => {
      const svg = render(<IconArrowTrendingUp size={22} />).container.querySelector('svg')
      expect(svg.getAttribute('width')).toBe('22')
      expect(svg.getAttribute('height')).toBe('22')
      expect(svg.getAttribute('aria-hidden')).toBe('true')
      expect(svg.getAttribute('stroke')).toBe('currentColor')
    })
    it('both spread extra props onto the root svg, no <img> in sight', () => {
      const clipboard = render(<IconClipboardList className="my-class" />).container
      const arrow = render(<IconArrowTrendingUp className="my-class" />).container
      expect(clipboard.querySelector('svg').getAttribute('class')).toBe('my-class')
      expect(clipboard.querySelector('img')).toBeNull()
      expect(arrow.querySelector('svg').getAttribute('class')).toBe('my-class')
      expect(arrow.querySelector('img')).toBeNull()
    })

    // Task 1 review fix: the 3 list-line shapes were originally separate
    // <rect> elements at opacity .3/.55 with no fill of their own, so they
    // inherited fill={color} from the root svg -- painting the exact same
    // color as the opaque clipboard body beneath them. Alpha-compositing a
    // color over an identically-colored base is a no-op (0.3*C + 0.7*C = C),
    // so the lines were structurally invisible in every color, not just a
    // contrast problem -- the same "opacity accent over identical base"
    // class of bug as #211/#212. Fixed by folding the list-lines into the
    // body path itself as fillRule="evenodd" cutouts (real transparency)
    // instead of an alpha-blended overlay. This guards against a regression
    // back to same-color opacity rects for the list lines.
    it('IconClipboardList draws its list lines as evenodd cutouts, not same-color opacity rects', () => {
      const svg = render(<IconClipboardList />).container.querySelector('svg')
      // No opacity-only <rect> list-lines left to silently blend into the body.
      expect(svg.querySelectorAll('rect').length).toBe(0)
      const evenoddPath = Array.from(svg.querySelectorAll('path')).find(
        (p) => p.getAttribute('fill-rule') === 'evenodd'
      )
      expect(evenoddPath).toBeTruthy()
      // The cutouts must actually be present in that path's data, not lost.
      expect(evenoddPath.getAttribute('d')).toContain('M8 9h8v1.8H8')
      expect(evenoddPath.getAttribute('d')).toContain('M8 13h8v1.8H8')
      expect(evenoddPath.getAttribute('d')).toContain('M8 17h5.5v1.8H8')
    })
  })

  // #229 Task 2: a shared PNG contract. Every PNG source is now cropped and
  // padded onto a square canvas (content ~84% fill, centred) at export time,
  // so `size` means the same size x size box for every icon, SVG or PNG. See
  // docs/superpowers/specs/2026-09-28-icon-design-system-design.md section 2.
  describe('PngIcon — #229 PNG contract', () => {
    it('renders a size x size img with no transform', () => {
      const img = render(<PngIcon src="data:image/png;base64," size={24} />).container.querySelector('img')
      expect(img.getAttribute('width')).toBe('24')
      expect(img.getAttribute('height')).toBe('24')
      expect(img.style.transform).toBe('')
    })

    it('IconClock and IconClipboardDocumentList render through PngIcon', () => {
      const clock = render(<IconClock size={24} />).container.querySelector('img')
      expect(clock.getAttribute('width')).toBe('24')
      expect(clock.getAttribute('height')).toBe('24')
      expect(clock.style.transform).toBe('')
      const clipboard = render(<IconClipboardDocumentList size={24} />).container.querySelector('img')
      expect(clipboard.getAttribute('width')).toBe('24')
      expect(clipboard.getAttribute('height')).toBe('24')
      expect(clipboard.style.transform).toBe('')
    })

    it('IconBarbell renders height === size, width by aspect — the one non-square icon', () => {
      const img = render(<IconBarbell size={28} />).container.querySelector('img')
      expect(img.getAttribute('height')).toBe('28')
      expect(img.hasAttribute('width')).toBe(false)
      expect(img.style.transform).toBe('')
    })

    it('every PNG in assets/icons is square except appmark', () => {
      const dir = resolve(process.cwd(), 'src/assets/icons')
      // upperbody.png/lowerbody.png are still the old, un-normalized sources
      // here — Task 4 of the #229 plan deletes them (DayIcon's SVG rewrite).
      // Tighten this back to the whole directory once that lands.
      const normalizedYet = (name) => name !== 'upperbody.png' && name !== 'lowerbody.png'
      for (const name of readdirSync(dir).filter(normalizedYet)) {
        if (!name.endsWith('.png')) continue
        const buf = readFileSync(join(dir, name))
        // PNG: 8-byte signature, then a 4-byte length + 4-byte "IHDR" chunk
        // header, then width/height as big-endian uint32s at bytes 16/20.
        const width = buf.readUInt32BE(16)
        const height = buf.readUInt32BE(20)
        if (name === 'appmark.png') {
          expect(width, `${name} should be wider than tall (the wordmark exception)`).toBeGreaterThan(height)
        } else {
          expect(width, `${name} should be square`).toBe(height)
        }
      }
    })
  })
})
