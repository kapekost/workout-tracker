import { describe, it, expect } from 'vitest'
import { colors } from './theme'

// These 9 values must stay byte-identical to index.css's :root custom
// properties (frontend/src/index.css:24-32). The two layers serve
// different consumers (see the design-tokens spec, section 1) but must
// never drift apart.
describe('theme colors match index.css :root', () => {
  it('carries over the 9 tier-1 tokens unchanged', () => {
    expect(colors.bg).toBe('#0a0a12')
    expect(colors.card).toBe('#111120')
    expect(colors.border).toBe('#1e1e32')
    expect(colors.mint).toBe('#6ee7b7')
    expect(colors.amber).toBe('#fbbf24')
    expect(colors.muted).toBe('#9ca3af')
    expect(colors.muted2).toBe('#6b7280')
    expect(colors.text).toBe('#fff')
    expect(colors.danger).toBe('#ef4444')
  })
})
