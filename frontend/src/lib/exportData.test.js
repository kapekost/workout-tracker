import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadExport } from './exportData'
import { api } from '../api'

vi.mock('../api', () => ({ api: { get: vi.fn() } }))

beforeEach(() => {
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
  const a = { href: '', download: '', click: vi.fn() }
  vi.spyOn(document, 'createElement').mockReturnValue(a)
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('downloadExport', () => {
  it('fetches export and triggers a download', async () => {
    api.get.mockResolvedValue({ exported_at: '2026-07-08T00:00:00Z', tables: {} })
    await downloadExport()
    expect(api.get).toHaveBeenCalledWith('/export')
    expect(document.createElement).toHaveBeenCalledWith('a')
    expect(document.createElement.mock.results[0].value.click).toHaveBeenCalled()
  })

  it('propagates a fetch error to the caller', async () => {
    api.get.mockRejectedValue(new Error('offline'))
    await expect(downloadExport()).rejects.toThrow('offline')
  })
})
