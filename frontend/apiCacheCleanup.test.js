import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// public/api-cache-cleanup.js is loaded into the generated service worker via
// importScripts() (a classic script, not an ES module), so it can't be
// imported directly here. Evaluate its real source against faked `self` /
// `caches` globals instead, to exercise the actual shipped behavior.
const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'public',
  'api-cache-cleanup.js',
)
const scriptSource = readFileSync(scriptPath, 'utf-8')

function runActivateHandler(existingCacheKeys) {
  const listeners = []
  const fakeSelf = {
    addEventListener: (type, handler) => {
      if (type === 'activate') listeners.push(handler)
    },
  }
  const deleted = []
  const fakeCaches = {
    keys: () => Promise.resolve(existingCacheKeys),
    delete: (key) => {
      deleted.push(key)
      return Promise.resolve(true)
    },
  }
  const evaluate = new Function('self', 'caches', scriptSource)
  evaluate(fakeSelf, fakeCaches)

  const waited = []
  const fakeEvent = { waitUntil: (promise) => waited.push(promise) }
  listeners[0](fakeEvent)
  return Promise.all(waited).then(() => deleted)
}

describe('api-cache-cleanup activate handler', () => {
  it('deletes every api-reads-* cache', async () => {
    const deleted = await runActivateHandler(['api-reads-abc1234', 'demo-frames', 'api-reads-def5678'])
    expect(deleted.sort()).toEqual(['api-reads-abc1234', 'api-reads-def5678'])
  })

  it('leaves non-api-reads caches alone', async () => {
    const deleted = await runActivateHandler(['demo-frames', 'workbox-precache-v2'])
    expect(deleted).toEqual([])
  })

  it('does nothing when no caches exist yet', async () => {
    const deleted = await runActivateHandler([])
    expect(deleted).toEqual([])
  })
})
