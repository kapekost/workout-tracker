import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Chip from './Chip'
import { colors } from '../lib/theme'

// jsdom's CSSOM serializes an inline hex color back out as rgb(...) — see
// Workout.test.jsx's identical helper.
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

describe('Chip', () => {
  it('renders the stateless label form as a plain, non-interactive span', () => {
    render(<Chip color={colors.muted}>Chest</Chip>)
    const el = screen.getByText('Chest')
    expect(el.tagName).toBe('SPAN')
    expect(el.style.color).toBe(hexToRgb(colors.muted))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders as a clickable button when onClick is given, and fires it', () => {
    const onClick = vi.fn()
    render(<Chip onClick={onClick} selected={false}>Bench Press</Chip>)
    const btn = screen.getByRole('button', { name: 'Bench Press' })
    expect(btn.className).toContain('tap-target')
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('selected=true renders the color-tinted active treatment (defaults to mint)', () => {
    render(<Chip onClick={() => {}} selected={true}>Bench Press</Chip>)
    const btn = screen.getByRole('button', { name: 'Bench Press' })
    expect(btn.style.color).toBe(hexToRgb(colors.mint))
  })

  it('selected=false renders the distinct inactive treatment, not the stateless one', () => {
    render(<Chip onClick={() => {}} selected={false}>Bench Press</Chip>)
    const btn = screen.getByRole('button', { name: 'Bench Press' })
    expect(btn.style.color).toBe(hexToRgb(colors.muted))
    expect(btn.style.background).not.toBe(hexToRgb(colors.border))
  })

  it('an explicit color prop drives the selected treatment for a non-default accent', () => {
    render(<Chip onClick={() => {}} selected={true} color={colors.amber}>Upper A</Chip>)
    const btn = screen.getByRole('button', { name: 'Upper A' })
    expect(btn.style.color).toBe(hexToRgb(colors.amber))
  })
})
