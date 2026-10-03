import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatPair from './StatPair'
import { colors } from '../lib/theme'

describe('StatPair', () => {
  it('renders the label and value', () => {
    render(<StatPair label="Sessions" value="12" />)
    expect(screen.getByText('Sessions')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('supports alignment and value colour', () => {
    render(<StatPair label="Personal Record" value="100 kg" align="right" valueColor="#fbbf24" />)
    expect(screen.getByText('Personal Record').parentElement).toHaveStyle({ textAlign: 'right' })
    expect(screen.getByText('100 kg')).toHaveStyle({ color: '#fbbf24' })
  })

  // jsdom's CSSOM serializes an inline hex color back out as rgb(...) — see
  // Eyebrow.test.jsx's identical helper.
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16)
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
  }

  // 2026-09-06 UI review, item 17: StatPair used to hardcode its own
  // label styling as a byte-for-byte reimplementation of Eyebrow instead of
  // reusing it. Asserting the label renders through Eyebrow's actual
  // treatment (uppercase + letter-spacing via CSS, not a literal-uppercase
  // string) is what would catch a regression back to a hand-rolled <p>.
  it("renders the label through Eyebrow's shared treatment, not a hardcoded copy", () => {
    render(<StatPair label="Sessions" value="12" />)
    const labelEl = screen.getByText('Sessions')
    expect(labelEl.tagName).toBe('P')
    expect(labelEl.style.textTransform).toBe('uppercase')
    expect(labelEl.style.letterSpacing).toBe('0.08em')
    expect(labelEl.style.color).toBe(hexToRgb(colors.muted))
  })

  it('defaults the value to colors.text when no valueColor is given', () => {
    render(<StatPair label="Sessions" value="12" />)
    // colors.text is the 3-digit '#fff' shorthand, which the 6-digit
    // hexToRgb helper above can't parse -- jsdom's CSSOM always normalizes
    // it to this regardless of which shorthand it was set from.
    expect(screen.getByText('12').style.color).toBe('rgb(255, 255, 255)')
  })
})
