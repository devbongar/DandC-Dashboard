export function formatPermitId(n) {
  const num = typeof n === 'string' ? parseInt(n, 10) : n
  if (!Number.isFinite(num) || num < 1) return ''
  return `PRMT-${String(num).padStart(6, '0')}`
}

export function isOverdue(permit, now = new Date()) {
  if (!permit?.planned_finish) return false
  if (permit.status === 'acquired') return false
  return new Date(permit.planned_finish) < now
}

export function computePermitStatus(permit, now = new Date()) {
  if (permit.status === 'acquired' || permit.actual_finish) return 'acquired'
  if (isOverdue(permit, now)) return 'overdue'
  if (permit.actual_start) return 'in-progress'
  return 'pending'
}

export const STATUS_BADGE = {
  pending:       'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  'in-progress': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  acquired:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  overdue:       'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}
