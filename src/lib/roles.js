export const ROLES = ['admin', 'head', 'reviewer', 'endorser', 'reporter', 'viewer', 'approver', 'updater']
export const SITE_ROLES = ['viewer', 'reporter', 'endorser']
export const TEAMS = ['ho', 'site']

export const ROLE_LABELS = {
  admin:    'Admin',
  head:     'Head',
  reviewer: 'Reviewer',
  endorser: 'Endorser',
  reporter: 'Reporter',
  viewer:   'Viewer',
  approver: 'Approver',
  updater:  'Updater',
}

export const ROLE_COLORS = {
  admin:    'bg-black text-white',
  head:     'bg-purple-600 text-white',
  reviewer: 'bg-amber-500 text-white',
  endorser: 'bg-emerald-600 text-white',
  reporter: 'bg-sky-600 text-white',
  viewer:   'bg-gray-500 text-white',
  approver: 'bg-blue-600 text-white',
  updater:  'bg-teal-600 text-white',
}

export const ROLE_BADGE = {
  admin:    'bg-white text-black',
  head:     'bg-purple-500 text-white',
  reviewer: 'bg-amber-500 text-white',
  endorser: 'bg-emerald-500 text-white',
  reporter: 'bg-sky-500 text-white',
  viewer:   'bg-gray-500 text-white',
  approver: 'bg-blue-500 text-white',
  updater:  'bg-teal-500 text-white',
}

export const isHO   = (profile) => profile?.team === 'ho'
export const isSite = (profile) => profile?.team === 'site'
export const isAdmin = (profile) => profile?.role === 'admin'

export const canEdit = (profile) =>
  profile?.role === 'admin' || profile?.role === 'reporter'

export const canEndorse = (profile) => profile?.role === 'endorser'

export const navKeyForProfile = (profile) => {
  const role = profile?.role
  if (role === 'admin')                           return 'admin'
  if (role === 'head' || role === 'reviewer')     return 'ho'
  if (role === 'endorser' || role === 'reporter') return 'reporter'
  if (role === 'approver' || role === 'updater')  return 'member'
  return 'viewer'
}
