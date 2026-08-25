import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EmptyState from './EmptyState'
import { space, type, colors } from '../lib/theme'

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

describe('EmptyState', () => {
  it('renders title and subtitle inside a centered card at the unified padding', () => {
    const { container } = render(
      <EmptyState title="No sessions yet." subtitle="Your workout history will appear here." />
    )
    const card = container.firstChild
    expect(card.className).toBe('card')
    expect(card.style.padding).toBe(`${space.xxxl}px`)
    expect(card.style.textAlign).toBe('center')

    const title = screen.getByText('No sessions yet.')
    expect(title.style.color).toBe(hexToRgb(colors.muted2))

    const subtitle = screen.getByText('Your workout history will appear here.')
    expect(subtitle.style.color).toBe(hexToRgb(colors.muted))
    expect(subtitle.style.fontSize).toBe(type.size.md)
    expect(subtitle.style.marginTop).toBe(`${space.xs}px`)
  })

  it('omits the subtitle paragraph entirely when none is given', () => {
    render(<EmptyState title="No data yet." />)
    expect(screen.getByText('No data yet.')).toBeInTheDocument()
    expect(screen.queryByText('Your workout history will appear here.')).not.toBeInTheDocument()
  })
})
