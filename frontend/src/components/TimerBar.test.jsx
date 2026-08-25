import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TimerBar from './TimerBar'

vi.mock('../lib/sound', () => ({ playBeep: vi.fn() }))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))

const baseProps = {
  sessionStartMs: Date.now(), restTargetSec: 90,
  onAddRest: () => {}, onSkipRest: () => {}, color: '#6ee7b7',
  wakeLockHeld: false, onTogglePause: () => {},
}

describe('TimerBar rest states', () => {
  it('idle: READY and the dash glyph', () => {
    render(<TimerBar {...baseProps} restStartMs={null} paused={false} pausedRem={null} />)
    expect(screen.getByText('READY')).toBeInTheDocument()
    expect(screen.getByText('—:—')).toBeInTheDocument()
  })

  it('resting: REST and a live countdown', () => {
    render(<TimerBar {...baseProps} restStartMs={Date.now()} paused={false} pausedRem={null} />)
    expect(screen.getByText('REST')).toBeInTheDocument()
  })

  it('paused: PAUSED and the frozen remaining time', () => {
    render(<TimerBar {...baseProps} restStartMs={null} paused={true} pausedRem={45} />)
    expect(screen.getByText('PAUSED')).toBeInTheDocument()
    expect(screen.getByText('0:45')).toBeInTheDocument()
  })

  it('rest hits zero: GO', () => {
    const past = Date.now() - 91_000
    render(<TimerBar {...baseProps} restStartMs={past} paused={false} pausedRem={null} />)
    expect(screen.getByText('GO')).toBeInTheDocument()
  })

  it('idle + no sets logged yet this session: shows the discovery hint instead of READY', () => {
    render(<TimerBar {...baseProps} restStartMs={null} paused={false} pausedRem={null} hasLoggedSets={false} />)
    expect(screen.getByText('LOG A SET')).toBeInTheDocument()
    expect(screen.queryByText('READY')).not.toBeInTheDocument()
    // The dash-glyph placeholder and the (dimmed, disabled) controls stay
    // exactly as in the plain idle state — only the label text changes.
    expect(screen.getByText('—:—')).toBeInTheDocument()
  })

  it('idle + sets already logged this session: falls back to ordinary READY (hasLoggedSets default)', () => {
    render(<TimerBar {...baseProps} restStartMs={null} paused={false} pausedRem={null} />)
    expect(screen.getByText('READY')).toBeInTheDocument()
    expect(screen.queryByText('LOG A SET')).not.toBeInTheDocument()
  })
})
