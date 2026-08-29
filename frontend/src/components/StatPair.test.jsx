import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatPair from './StatPair'

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
})
