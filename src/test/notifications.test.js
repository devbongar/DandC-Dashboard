import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendIssueNotification, sendTeamsNotification } from '../lib/notifications'

vi.stubEnv('VITE_RESEND_API_KEY', 'test-key-123')

const mockIssue  = { issue: 'Missing signature', description: 'Approval page unsigned' }
const mockPermit = { id: 'PRMT-000001', name: 'Building Permit', project_id: 'PRJ-000001' }
const mockUser   = { email: 'user@example.com', full_name: 'Juan Cruz' }

describe('sendIssueNotification', () => {
  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { vi.restoreAllMocks() })

  it('returns ok:false when recipient email is missing', async () => {
    const result = await sendIssueNotification(mockIssue, mockPermit, { email: null })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/email/i)
  })

  it('calls Resend API with correct URL and auth header', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true })
    await sendIssueNotification(mockIssue, mockPermit, mockUser)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key-123' }),
      })
    )
  })

  it('returns ok:true on success', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true })
    const result = await sendIssueNotification(mockIssue, mockPermit, mockUser)
    expect(result.ok).toBe(true)
  })

  it('returns ok:false when fetch throws', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network'))
    const result = await sendIssueNotification(mockIssue, mockPermit, mockUser)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('network')
  })
})

describe('sendTeamsNotification', () => {
  const payload = { title: 'Issue raised', text: 'New issue', permitId: 'PRMT-000001', permitName: 'Building Permit' }

  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { vi.restoreAllMocks() })

  it('returns ok:false when webhookUrl is empty', async () => {
    const result = await sendTeamsNotification(payload, '')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/webhook/i)
  })

  it('calls the webhook URL with POST', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true })
    await sendTeamsNotification(payload, 'https://teams.example.com/webhook')
    expect(global.fetch).toHaveBeenCalledWith('https://teams.example.com/webhook', expect.objectContaining({ method: 'POST' }))
  })

  it('returns ok:true on success', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true })
    const result = await sendTeamsNotification(payload, 'https://teams.example.com/webhook')
    expect(result.ok).toBe(true)
  })

  it('returns ok:false on fetch error', async () => {
    global.fetch.mockRejectedValueOnce(new Error('timeout'))
    const result = await sendTeamsNotification(payload, 'https://teams.example.com/webhook')
    expect(result.ok).toBe(false)
  })
})
