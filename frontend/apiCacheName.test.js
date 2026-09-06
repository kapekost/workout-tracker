import { describe, it, expect } from 'vitest'
import { apiReadsCacheName } from './apiCacheName.js'

describe('apiReadsCacheName', () => {
  it('embeds the given commit in the cache name', () => {
    expect(apiReadsCacheName('abc1234')).toBe('api-reads-abc1234')
  })

  it('is stable for the same commit', () => {
    expect(apiReadsCacheName('abc1234')).toBe(apiReadsCacheName('abc1234'))
  })

  it('produces a different name for a different commit', () => {
    expect(apiReadsCacheName('abc1234')).not.toBe(apiReadsCacheName('def5678'))
  })

  it('works with the local-dev fallback value too', () => {
    expect(apiReadsCacheName('dev')).toBe('api-reads-dev')
  })
})
