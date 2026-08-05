/**
 * Format a number into USR-XXXXXX format with leading zeros.
 * @param {number} n - The sequential number (0, 1, 2, ...)
 * @returns {string} Formatted user code (e.g., "USR-000001")
 * @throws {Error} If input is invalid
 */
export function formatUserCode(n) {
  if (typeof n !== 'number' || n < 0 || !Number.isInteger(n)) {
    throw new Error(`Invalid user code number: ${n}. Must be a non-negative integer.`)
  }
  const padded = String(n).padStart(6, '0')
  return `USR-${padded}`
}

/**
 * Validate if a string is a valid user code.
 * @param {string} str - The string to validate
 * @returns {boolean} True if valid USR-XXXXXX format (exactly 6 digits)
 */
export function isUserCode(str) {
  if (typeof str !== 'string') {
    return false
  }
  return /^USR-\d{6}$/.test(str)
}
