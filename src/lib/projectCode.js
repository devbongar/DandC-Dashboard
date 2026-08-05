export function formatProjectCode(n) {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`formatProjectCode: n must be a positive integer, got ${JSON.stringify(n)}`)
  }
  return `PRJ-${String(n).padStart(6, '0')}`
}

export function isProjectCode(str) {
  return typeof str === 'string' && /^PRJ-\d{6}$/.test(str)
}
