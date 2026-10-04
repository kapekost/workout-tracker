// #229 icon design system guard: every icon call site must use a role from
// `icon` (frontend/src/lib/theme.js), not a bare pixel number. A call site
// that regresses to `size={14}` fails here instead of silently shrinking.
// Same style as theme.test.js's CSS-parity check: no ESLint dependency, just
// a regex scan over the real source tree.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { resolve, join } from 'path'

const SRC = resolve(process.cwd(), 'src')

function listJsxFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (full === join(SRC, 'icons')) continue
      out.push(...listJsxFiles(full))
      continue
    }
    if (name.endsWith('.jsx') && !name.endsWith('.test.jsx')) out.push(full)
  }
  return out
}

describe('icon-scale guard — #229', () => {
  it('scans more than 30 files, so a wrong glob cannot pass silently', () => {
    expect(listJsxFiles(SRC).length).toBeGreaterThan(30)
  })

  it('no call site hard-codes a numeric icon size outside src/icons/', () => {
    const offenders = []
    for (const file of listJsxFiles(SRC)) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        // DayAccent size={6} is a space value (the accent dot), not an icon
        // role — see Task 1's brief. Allow-listed rather than passed through
        // a `space` token, per the brief's stated preference.
        if (/size=\{6\}/.test(line) && /DayAccent/.test(line)) return
        if (/size=\{[0-9]/.test(line)) {
          offenders.push(`${file.replace(SRC + '/', 'src/')}:${i + 1}`)
        }
      })
    }
    expect(offenders, `hard-coded icon sizes found:\n${offenders.join('\n')}`).toEqual([])
  })
})
