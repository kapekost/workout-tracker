import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'
import { type, colors } from './theme'

// Wave 0 of docs/superpowers/plans/2026-10-03-design-review-findings.md, items
// 0.4-0.7. Four small defects and three guards. Every one of these guards
// exists because the thing it protects was true at the moment it was written —
// this file is the check, the comments in the source are the advice.

const SRC = resolve(process.cwd(), 'src')
const cssRaw = readFileSync(resolve(SRC, 'index.css'), 'utf8')

// Declarations only. The stylesheet documents its own history in comments — and
// it has to, because "this used to be 1.12:1 and was wrong" is the most useful
// thing a future reader can be told — and those comments quote the retired hexes
// and the old ratios verbatim. Scanning comments would fail the guards on their
// own documentation.
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '')

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.jsx?$/.test(name) && !/\.test\./.test(name) ? [full] : []
  })
}

const sources = walk(SRC).map(f => ({ file: f.slice(SRC.length + 1), text: readFileSync(f, 'utf8') }))

function cssVar(name) {
  const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`))
  if (!m) throw new Error(`no ${name} in index.css`)
  return m[1]
}

// Style objects a JSX tag can spread in, e.g. PersonalBests' `fieldStyle`.
// Brace-counted rather than regex-matched to the next `\n}`: an earlier object
// literal whose closing brace is not on its own line swallows everything up to
// the next one that is, which is how the first version of this silently missed
// the one input in PersonalBests that carries its size that way.
function styleConsts(text) {
  const out = {}
  for (const m of text.matchAll(/const\s+(\w+)\s*=\s*\{/g)) {
    let depth = 0
    for (let i = m.index + m[0].length - 1; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}' && --depth === 0) {
        const body = text.slice(m.index + m[0].length, i)
        const fm = body.match(/fontSize:\s*'([0-9.]+rem)'/) || body.match(/fontSize:\s*type\.size\.(\w+)/)
        if (fm) out[m[1]] = fm[1].endsWith('rem') ? fm[1] : type.size[fm[1]]
        break
      }
    }
  }
  return out
}

function remToPx(rem) { return parseFloat(rem) * 16 }

// ── 0.5 type-size parity ────────────────────────────────────────────────────
// The honest version of "theme.js and index.css agree on sizes". `type.size`
// has no :root counterpart to compare against — sizes are consumed as JS values
// or written straight into index.css — so this cannot be a two-way parity check
// like the colour one above it. What it *can* do is catch the failure that
// actually happens: a new size appearing in one layer and not the other, with no
// reason attached. Deliberate one-offs live in type.offScale with their reason
// inline, and the second test below stops that list accumulating permissions.
describe('type sizes: every size in use is on the scale or justified', () => {
  const onScale = Object.values(type.size)
  const allowed = new Set([...onScale, ...Object.keys(type.offScale)])

  it('index.css writes no font-size that is neither a token nor allowlisted', () => {
    const offenders = [...css.matchAll(/font-size:\s*([0-9.]+rem)/g)]
      .map(m => m[1])
      .filter(v => !allowed.has(v))
    expect(offenders, `index.css has off-scale font sizes: ${[...new Set(offenders)].join(', ')}`)
      .toEqual([])
  })

  it('inline styles write no font-size that is neither a token nor allowlisted', () => {
    // The CSS-only version of this test would have passed while Home.jsx kept a
    // 1.2rem chevron and ExerciseCuesModal kept a 1.3rem heading — the drift is
    // mostly inline, because that is how this app styles. A test that only reads
    // index.css manufactures confidence, which is worse than no test.
    const offenders = []
    for (const { file, text } of sources) {
      for (const m of text.matchAll(/fontSize:\s*'([0-9.]+rem)'/g)) {
        if (!allowed.has(m[1])) offenders.push(`${file}: ${m[1]}`)
      }
    }
    expect(offenders, `off-scale inline font sizes: ${offenders.join(', ')}`).toEqual([])
  })

  it('every allowlisted size is actually used, so the list cannot rot', () => {
    // An allowlist with no consumer check is a permission slip. This is how
    // `2.2rem` survives: the entry outlives the thing that justified it.
    const body = sources.map(s => s.text).join('\n') + css
    const unused = Object.keys(type.offScale).filter(
      v => !new RegExp(`(font-size:\\s*${v.replace('.', '\\.')}|fontSize:\\s*'${v.replace('.', '\\.')}')`).test(body)
    )
    expect(unused, `allowlisted but unused: ${unused.join(', ')}`).toEqual([])
  })

  it('every allowlisted size carries a reason', () => {
    for (const [size, reason] of Object.entries(type.offScale)) {
      expect(reason, `${size} has no reason`).toBeTruthy()
      expect(reason.length, `${size}'s reason is a stub`).toBeGreaterThan(20)
    }
  })

  it('nothing in the app renders body text below the scale floor', () => {
    // `xs` (0.65rem) is the floor and it is a label size. 0.6rem was below it and
    // had three call sites, one of them the "0 = bodyweight only" caption read
    // mid-set. Nothing in either layer may go under it now.
    const floor = remToPx(type.size.xs)
    const tooSmall = [...css.matchAll(/font-size:\s*([0-9.]+)rem/g)]
      .map(m => m[1])
      .filter(v => remToPx(v) < floor)
    expect(tooSmall, `below the ${type.size.xs} floor: ${[...new Set(tooSmall)].join(', ')}`).toEqual([])
  })
})

// ── 0.4 no cool-hued leftovers ──────────────────────────────────────────────
// The palette is a true neutral (each channel equal in every tier-1 token). Four
// values from the retired pre-Mono+Volt palette survived in index.css, which is
// how a design system rots from the edges: nothing stops a hex, it just stops
// being one.
describe('index.css has no retired-palette hues', () => {
  it('every hex literal is a true neutral or a documented palette token', () => {
    const neutralOrToken = new Set([
      ...Object.values(colors).filter(v => typeof v === 'string' && v.startsWith('#')),
      // The skeleton shimmer is a gradient, so it has no single token; both its
      // stops are neutrals and are asserted here rather than tokenised.
      '#1a1a1a', '#2f2f2f',
      // Deliberately not neutral: the timer-flash green, which is a state
      // colour (the GO state) rather than a palette leftover.
      '#2a4d2a',
    ])
    const stray = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
      .map(m => m[0].toLowerCase())
      .filter(hex => {
        if (neutralOrToken.has(hex)) return false
        // A neutral is r === g === b.
        const full = hex.length === 4
          ? '#' + hex.slice(1).split('').map(c => c + c).join('')
          : hex
        const n = parseInt(full.slice(1), 16)
        const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
        return !(r === g && g === b)
      })
    expect(stray, `cool-hued hexes left in index.css: ${[...new Set(stray)].join(', ')}`).toEqual([])
  })

  it("the stepper's pressed state is actually distinguishable from its resting state", () => {
    // The whole point of 0.4. `.btn-icon:active` was #2a2a42 against a resting
    // #2a2a2a: 1.03:1, i.e. identical. A pressed control that looks identical to
    // an unpressed one is not a pressed state, whatever the stylesheet says it
    // is. `.btn-icon` is also NumControl's +/- steppers — the most-tapped
    // control in the app.
    const resting = '#2a2a2a'
    const pressed = cssVar('--surface-raised')
    expect(contrastRatio(pressed, resting),
      `--surface-raised ${pressed} is invisible against its resting fill ${resting}`)
      .toBeGreaterThan(1.15)
  })
})

// ── 0.6 the contrast comments in index.css have to reproduce ────────────────
// These were the only contrast figures asserted anywhere outside this directory,
// which is exactly why they rotted: 1.12:1 measured 1.05, and 4.96:1 measured
// 4.63. Nobody re-ran the arithmetic, because nothing could.
describe('contrast figures quoted in index.css reproduce', () => {
  function cssVar(name) {
    const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`))
    if (!m) throw new Error(`no ${name} in index.css`)
    return m[1]
  }

  it('every "N:1" claimed in a comment is the ratio of the two values named beside it', () => {
    // Deliberately narrow: it reads the .form-error block, where both ratios
    // were wrong, and fails if the numbers drift from the tokens again. It does
    // not attempt to parse prose anywhere else.
    // Read from the raw file: this test is about a comment, and the declarations
    // around it were just stripped.
    const block = cssRaw.match(/\/\* The full border[\s\S]*?\*\//)
    expect(block, 'the .form-error comment is gone — update or delete this test').toBeTruthy()
    // The FIRST two ratios are the claims; anything after them is the record of
    // what they used to say ("it claimed 1.12:1 and 4.96:1"), which is exactly
    // the kind of sentence that makes a naive "find all the numbers" check
    // fail on its own comment. So the claims come first, and this asserts the
    // first two — if someone moves the history above them, this fails and says so.
    const ratios = [...block[0].matchAll(/([0-9.]+):1/g)].map(m => parseFloat(m[1]))
    expect(ratios.length, 'no ratios quoted any more — update or delete this test')
      .toBeGreaterThanOrEqual(2)

    expect(contrastRatio(cssVar('--danger-bg'), cssVar('--card'))).toBeCloseTo(ratios[0], 1)
    expect(contrastRatio(cssVar('--danger'), cssVar('--card'))).toBeCloseTo(ratios[1], 1)
  })
})

// ── the 16px focused-input floor, everywhere ────────────────────────────────
// Not in the original plan. Found by the owner using the app: the per-exercise
// note textarea was the only focusable text control in the app without the
// floor, at 0.8rem. iOS Safari zooms the page in on any focused field below
// 16px, and this one is focused *between sets* — the zoom lands mid-workout and
// moves the Log Set button out from under the user's thumb.
describe('no focusable text control renders below 16px', () => {
  const MIN = 16

  // Each entry: how to find the effective size for that control.
  const RESOLVERS = [
    { match: /fontSize:\s*'([0-9.]+rem)'/, resolve: m => remToPx(m[1]) },
    { match: /fontSize:\s*type\.size\.(\w+)/, resolve: (m, t) => remToPx(t.size[m[1]]) },
  ]

  it('every <textarea> and text <input> in src is at or above 1rem', () => {
    const problems = []
    for (const { file, text } of sources) {
      // Resolving `{...fieldStyle}` is the difference between checking every
      // input in the app and checking only the two thirds that happen to carry
      // their size inline.
      const consts = styleConsts(text)
      // Take each opening tag and the attributes that follow it. `=>` inside an
      // inline handler contains a `>`, which would otherwise end the tag early
      // and hide the very attribute being looked for — which is how the first
      // version of this test reported the note textarea as having no font-size
      // while it plainly did.
      // Neutralise arrow functions BEFORE matching, not after: `onChange={e =>
      // ...}` contains a `>`, so the lazy terminator stops the tag there and
      // every attribute after the first handler is invisible. Same length, so
      // nothing downstream shifts.
      const scan = text.replace(/=>/g, '=~').replace(/>=/g, '~=')
      for (const m of scan.matchAll(/<(textarea|input)\b([\s\S]{0,600}?)(?:\/>|>)/g)) {
        const [, tag, attrs] = m
        // Skip non-text inputs: number/checkbox/range have their own rules and
        // the type=number case is asserted separately below.
        const typeAttr = attrs.match(/type=["'{]\s*([\w-]+)/)
        const kind = typeAttr ? typeAttr[1] : (tag === 'textarea' ? 'textarea' : 'text')
        if (!['text', 'textarea', 'email', 'password', 'search', 'tel', 'url', 'number'].includes(kind)) continue

        const inline = RESOLVERS.map(r => attrs.match(r.match)).find(Boolean)
        if (inline) {
          const px = RESOLVERS.find(r => attrs.match(r.match)).resolve(inline, type)
          if (px < MIN) problems.push(`${file}: <${tag}> at ${px}px`)
          continue
        }
        const spread = attrs.match(/\.\.\.(\w+)/)
        if (spread && consts[spread[1]]) {
          const px = remToPx(consts[spread[1]])
          if (px < MIN) problems.push(`${file}: <${tag}> at ${px}px via ${spread[1]}`)
          continue
        }
        // No inline size: it must be carried by a class whose rule this file
        // also asserts. If neither, fail loudly rather than assume.
        if (/className="field"/.test(attrs)) continue      // .field — asserted below
        if (/type="number"/.test(attrs)) continue          // input[type=number] — asserted below
        problems.push(`${file}: <${tag} ${kind}> has no resolvable font-size — set one explicitly`)
      }
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  it('.field — the auth screens’ input class — is at the floor', () => {
    const rule = css.match(/\.field\s*\{[^}]*font-size:\s*([0-9.]+)rem/)
    expect(rule, '.field no longer sets a font-size — update this test').toBeTruthy()
    expect(remToPx(rule[1])).toBeGreaterThanOrEqual(MIN)
  })

  it('input[type=number] — the shared numeric control — is at the floor', () => {
    const rule = css.match(/input\[type="number"\]\s*\{[\s\S]*?font-size:\s*([0-9.]+)rem/)
    expect(rule, 'input[type=number] no longer sets a font-size — update this test').toBeTruthy()
    expect(remToPx(rule[1])).toBeGreaterThanOrEqual(MIN)
  })
})

// ── shared WCAG maths, verbatim from the file above ─────────────────────────
// Duplicated rather than extracted on purpose: this file must keep working even
// if theme.test.js is refactored, and a guard that depends on the thing it is
// guarding is not a guard. Same implementation, same 3-digit-shorthand trap.
function relativeLuminance(hex) {
  const full = hex.length === 4
    ? '#' + hex.slice(1).split('').map(c => c + c).join('')
    : hex
  const n = parseInt(full.slice(1), 16)
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => {
    const cs = c / 255
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(a, b) {
  const lA = relativeLuminance(a)
  const lB = relativeLuminance(b)
  const [hi, lo] = lA > lB ? [lA, lB] : [lB, lA]
  return (hi + 0.05) / (lo + 0.05)
}
