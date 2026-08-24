import { describe, it, expect } from 'vitest'
import { fetchAppSettings } from '../contexts/AppSettingsContext'

const makeClient = (rows) => ({
  from: () => ({ select: async () => ({ data: rows, error: null }) }),
})
const throwClient = {
  from: () => ({ select: async () => { throw new Error('Network error') } }),
}
const nullClient = {
  from: () => ({ select: async () => ({ data: null, error: { message: 'RLS denied' } }) }),
}

describe('fetchAppSettings', () => {
  it('returns logo URLs when both keys present', async () => {
    const client = makeClient([
      { key: 'logo_url',       value: 'https://cdn.example.com/logo.png' },
      { key: 'logo_white_url', value: 'https://cdn.example.com/logo-white.png' },
    ])
    const result = await fetchAppSettings(client)
    expect(result.logoUrl).toBe('https://cdn.example.com/logo.png')
    expect(result.logoWhiteUrl).toBe('https://cdn.example.com/logo-white.png')
  })

  it('returns null for missing keys in partial data', async () => {
    const client = makeClient([
      { key: 'logo_url', value: 'https://cdn.example.com/logo.png' },
    ])
    const result = await fetchAppSettings(client)
    expect(result.logoUrl).toBe('https://cdn.example.com/logo.png')
    expect(result.logoWhiteUrl).toBeNull()
  })

  it('returns nulls when data is null (RLS / query error)', async () => {
    const result = await fetchAppSettings(nullClient)
    expect(result.logoUrl).toBeNull()
    expect(result.logoWhiteUrl).toBeNull()
  })

  it('resolves with nulls and never throws when supabase throws', async () => {
    await expect(fetchAppSettings(throwClient)).resolves.toEqual({
      logoUrl: null,
      logoWhiteUrl: null,
    })
  })

  it('returns empty-array result as nulls', async () => {
    const client = makeClient([])
    const result = await fetchAppSettings(client)
    expect(result.logoUrl).toBeNull()
    expect(result.logoWhiteUrl).toBeNull()
  })
})
