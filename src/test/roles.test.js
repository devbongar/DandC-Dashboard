import { describe, it, expect } from 'vitest'
import {
  ROLES,
  TEAMS,
  ROLE_LABELS,
  ROLE_COLORS,
  ROLE_BADGE,
  isHO,
  isSite,
  isAdmin,
  canEdit,
  canEndorse,
  navKeyForProfile,
} from '../lib/roles'

describe('ROLES / TEAMS constants', () => {
  it('exports the six canonical roles', () => {
    expect(ROLES).toEqual(['admin', 'head', 'reviewer', 'endorser', 'reporter', 'viewer'])
  })
  it('exports the two canonical teams', () => {
    expect(TEAMS).toEqual(['ho', 'site'])
  })
})

describe('ROLE_LABELS', () => {
  it('has a label for every role', () => {
    ROLES.forEach(r => expect(ROLE_LABELS[r]).toBeTruthy())
  })
})

describe('ROLE_COLORS / ROLE_BADGE', () => {
  it('has a color and badge for every role', () => {
    ROLES.forEach(r => {
      expect(ROLE_COLORS[r]).toBeTruthy()
      expect(ROLE_BADGE[r]).toBeTruthy()
    })
  })
})

describe('isHO(profile)', () => {
  it('returns true for ho team', () => {
    expect(isHO({ role: 'admin',    team: 'ho' })).toBe(true)
    expect(isHO({ role: 'head',     team: 'ho' })).toBe(true)
    expect(isHO({ role: 'reviewer', team: 'ho' })).toBe(true)
    expect(isHO({ role: 'reporter', team: 'ho' })).toBe(true)
    expect(isHO({ role: 'viewer',   team: 'ho' })).toBe(true)
  })
  it('returns false for site team', () => {
    expect(isHO({ role: 'endorser', team: 'site' })).toBe(false)
    expect(isHO({ role: 'reporter', team: 'site' })).toBe(false)
    expect(isHO({ role: 'viewer',   team: 'site' })).toBe(false)
  })
  it('returns false for null/undefined profile', () => {
    expect(isHO(null)).toBe(false)
    expect(isHO(undefined)).toBe(false)
  })
})

describe('isSite(profile)', () => {
  it('returns true for site team', () => {
    expect(isSite({ role: 'endorser', team: 'site' })).toBe(true)
    expect(isSite({ role: 'reporter', team: 'site' })).toBe(true)
    expect(isSite({ role: 'viewer',   team: 'site' })).toBe(true)
  })
  it('returns false for ho team', () => {
    expect(isSite({ role: 'admin', team: 'ho' })).toBe(false)
  })
})

describe('isAdmin(profile)', () => {
  it('returns true only for admin role', () => {
    expect(isAdmin({ role: 'admin', team: 'ho' })).toBe(true)
    expect(isAdmin({ role: 'head',  team: 'ho' })).toBe(false)
    expect(isAdmin(null)).toBe(false)
  })
})

describe('canEdit(profile)', () => {
  it('returns true for admin, reporter roles', () => {
    expect(canEdit({ role: 'admin',    team: 'ho'   })).toBe(true)
    expect(canEdit({ role: 'reporter', team: 'ho'   })).toBe(true)
    expect(canEdit({ role: 'reporter', team: 'site' })).toBe(true)
  })
  it('returns false for viewer, endorser, head, reviewer', () => {
    expect(canEdit({ role: 'viewer',   team: 'ho'   })).toBe(false)
    expect(canEdit({ role: 'endorser', team: 'site' })).toBe(false)
    expect(canEdit({ role: 'head',     team: 'ho'   })).toBe(false)
    expect(canEdit({ role: 'reviewer', team: 'ho'   })).toBe(false)
  })
  it('returns false for null', () => {
    expect(canEdit(null)).toBe(false)
  })
})

describe('canEndorse(profile)', () => {
  it('returns true for endorser', () => {
    expect(canEndorse({ role: 'endorser', team: 'site' })).toBe(true)
  })
  it('returns false for other roles', () => {
    expect(canEndorse({ role: 'reporter', team: 'site' })).toBe(false)
    expect(canEndorse({ role: 'admin',    team: 'ho'   })).toBe(false)
    expect(canEndorse(null)).toBe(false)
  })
})

describe('navKeyForProfile(profile)', () => {
  it('returns the NAV key matching the role for sidebar lookup', () => {
    expect(navKeyForProfile({ role: 'admin',    team: 'ho'   })).toBe('admin')
    expect(navKeyForProfile({ role: 'head',     team: 'ho'   })).toBe('ho')
    expect(navKeyForProfile({ role: 'reviewer', team: 'ho'   })).toBe('ho')
    expect(navKeyForProfile({ role: 'endorser', team: 'site' })).toBe('reporter')
    expect(navKeyForProfile({ role: 'reporter', team: 'ho'   })).toBe('reporter')
    expect(navKeyForProfile({ role: 'reporter', team: 'site' })).toBe('reporter')
    expect(navKeyForProfile({ role: 'viewer',   team: 'ho'   })).toBe('viewer')
    expect(navKeyForProfile({ role: 'viewer',   team: 'site' })).toBe('viewer')
    expect(navKeyForProfile(null)).toBe('viewer')
  })
})
