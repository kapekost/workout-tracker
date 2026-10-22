import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PlanAI from './PlanAI'

const retry = vi.hoisted(() => vi.fn())

vi.mock('../lib/planContext', () => ({ usePlan: () => ({ retry }) }))
vi.mock('../api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))
import { api } from '../api'

const EXPORT = {
  schema: 'workout-tracker/plan-context-export/v1',
  plan: { upper_a: { exercises: [] } },
  prompt_template: 'PROMPT TEXT',
}
const ENVELOPE = {
  schema: 'workout-tracker/plan-update/v1',
  summary: 'More chest volume.',
  day_updates: [{ day_key: 'upper_a', exercise_updates: [{ op: 'modify', exercise_id: 'bench_press', sets: 4 }] }],
}
const PREVIEW = {
  days_affected: 1, exercises_added: 0, exercises_modified: 1, exercises_removed: 0,
  details: ['Upper A: Bench Press sets 3 to 4'], ai_summary: 'More chest volume.',
}

function httpError(status, detail) {
  return Object.assign(new Error(`API POST /plan/update → ${status}`), { status, detail })
}

function renderPage() {
  return render(<MemoryRouter><PlanAI /></MemoryRouter>)
}

function paste(text) {
  fireEvent.change(screen.getByLabelText('Reply from your AI'), { target: { value: text } })
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue(EXPORT)
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('export', () => {
  it('copies the prompt and the data as one block', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt + your data' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled())
    expect(api.get).toHaveBeenCalledWith('/plan/export')
    const text = navigator.clipboard.writeText.mock.calls[0][0]
    expect(text.startsWith('PROMPT TEXT')).toBe(true)
    expect(text).toContain('"workout-tracker/plan-context-export/v1"')
    expect(text).not.toContain('"prompt_template"')
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })

  it('shows the block to copy by hand when the clipboard is refused', async () => {
    navigator.clipboard.writeText.mockRejectedValue(new Error('denied'))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt + your data' }))
    const box = await screen.findByLabelText('Prompt and data')
    expect(box.value).toContain('PROMPT TEXT')
  })

  it('says so when the export fails', async () => {
    api.get.mockRejectedValue(httpError(500, null))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt + your data' }))
    expect(await screen.findByText("Couldn't load your data. Try again.")).toBeInTheDocument()
  })
})

describe('paste-back', () => {
  it('keeps Preview off until there is a reply and Confirm off until a preview', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
  })

  it('previews as counts and a change list, then confirms', async () => {
    api.post.mockResolvedValueOnce(PREVIEW).mockResolvedValueOnce(PREVIEW)
    renderPage()
    paste(JSON.stringify(ENVELOPE))
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(await screen.findByText('Upper A: Bench Press sets 3 to 4')).toBeInTheDocument()
    expect(screen.getByText('More chest volume.')).toBeInTheDocument()
    expect(screen.getByText('1 modified')).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/plan/update', { envelope: ENVELOPE, confirm: false })

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(api.post).toHaveBeenLastCalledWith('/plan/update', { envelope: ENVELOPE, confirm: true }))
    await waitFor(() => expect(retry).toHaveBeenCalled())
    expect(await screen.findByText('Plan updated')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View plan' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
    expect(screen.getByLabelText('Reply from your AI').value).toBe('')
  })

  it('reads a reply the AI wrapped in a code fence or prose', async () => {
    api.post.mockResolvedValue(PREVIEW)
    renderPage()
    paste('Here you go:\n```json\n' + JSON.stringify(ENVELOPE) + '\n```')
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/plan/update', { envelope: ENVELOPE, confirm: false }))
  })

  it('names the problem when the reply is not JSON, without calling the server', () => {
    renderPage()
    paste('Sure! I would add more chest work.')
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByRole('alert').textContent).toMatch(/isn't valid JSON/)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows the server\'s own message for a failed validation', async () => {
    api.post.mockRejectedValue(httpError(400, 'day_updates[0].exercise_updates[1] (modify): sets must be at most 10'))
    renderPage()
    paste(JSON.stringify(ENVELOPE))
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect((await screen.findByRole('alert')).textContent).toContain('sets must be at most 10')
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
  })

  it('shows the open-workout message on a 409', async () => {
    api.post.mockRejectedValue(httpError(409, 'Finish or discard your current workout first'))
    renderPage()
    paste(JSON.stringify(ENVELOPE))
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Finish or discard your current workout first')
  })

  it('drops the preview when the reply is edited, so Confirm never applies unseen text', async () => {
    api.post.mockResolvedValue(PREVIEW)
    renderPage()
    paste(JSON.stringify(ENVELOPE))
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    await screen.findByRole('button', { name: 'Confirm' })
    paste(JSON.stringify({ ...ENVELOPE, summary: 'changed' }))
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
  })

  it('keeps the preview and says so when the confirm fails', async () => {
    api.post.mockResolvedValueOnce(PREVIEW).mockRejectedValueOnce(httpError(409, 'Finish or discard your current workout first'))
    renderPage()
    paste(JSON.stringify(ENVELOPE))
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    const msg = (await screen.findByRole('alert')).textContent
    expect(msg).toContain('Finish or discard')
    expect(msg).toContain('Your plan is unchanged')
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(retry).not.toHaveBeenCalled()
  })

  it('does not claim the plan is unchanged when the confirm got no answer', async () => {
    api.post.mockResolvedValueOnce(PREVIEW).mockRejectedValueOnce(httpError(undefined, null))
    renderPage()
    paste(JSON.stringify(ENVELOPE))
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    const msg = (await screen.findByRole('alert')).textContent
    expect(msg).not.toContain('unchanged')
    expect(retry).toHaveBeenCalled()
  })

  it('offers no Confirm for a reply that changes nothing', async () => {
    api.post.mockResolvedValue({ ...PREVIEW, exercises_modified: 0, details: [] })
    renderPage()
    paste(JSON.stringify(ENVELOPE))
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(await screen.findByText('No changes')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
  })
})
