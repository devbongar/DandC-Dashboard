// Date format helpers: DB = YYYY-MM-DD, Excel = MM-DD-YYYY

export function formatDateForExcel(value) {
  if (!value) return ''
  const parts = String(value).split('-')
  if (parts.length !== 3) return ''
  const [y, m, d] = parts
  return `${m}/${d}/${y}`
}

function dateToDbString(date) {
  if (isNaN(date.getTime())) return null
  const y  = date.getUTCFullYear()
  const m  = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d  = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseDateFromExcel(value) {
  if (value == null || value === '') return null

  // JS Date object (cellDates: true)
  if (value instanceof Date) return dateToDbString(value)

  // Excel serial number fallback
  if (typeof value === 'number') {
    return dateToDbString(new Date(Math.round((value - 25569) * 86400 * 1000)))
  }

  const str = String(value).trim()
  if (!str) return null
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  const [, m, d, y] = match
  const mm = m.padStart(2, '0')
  const dd = d.padStart(2, '0')
  const date = new Date(`${y}-${mm}-${dd}`)
  if (isNaN(date.getTime()) || date.getMonth() + 1 !== Number(m)) return null
  return `${y}-${mm}-${dd}`
}

const DATE_FIELDS = [
  { col: 3, key: 'planned_start',  label: 'Planned Start' },
  { col: 4, key: 'planned_finish', label: 'Planned End' },
  { col: 5, key: 'actual_start',   label: 'Actual Start' },
  { col: 6, key: 'actual_finish',  label: 'Actual End' },
  { col: 7, key: 'forecast_start', label: 'Forecast Start' },
  { col: 8, key: 'forecast_finish',label: 'Forecast End' },
]

export function validatePermitImportSheet(rows, existingIds) {
  const valid = []
  const skipped = []
  const data = rows.slice(1)

  for (const row of data) {
    const permitId   = String(row[0] ?? '').trim()
    const permitName = String(row[1] ?? '').trim()

    if (!permitId) {
      skipped.push({ permitId: '', permitName, reason: 'No Permit ID' })
      continue
    }
    if (!existingIds.has(permitId)) {
      skipped.push({ permitId, permitName, reason: 'Permit ID not found' })
      continue
    }

    let invalid = null
    for (const { col, label } of DATE_FIELDS) {
      const cell = row[col]
      const isEmpty = cell == null || cell === ''
      if (!isEmpty && !parseDateFromExcel(cell)) {
        invalid = `Invalid date format in ${label}`
        break
      }
    }
    if (invalid) {
      skipped.push({ permitId, permitName, reason: invalid })
      continue
    }

    const entry = { id: permitId }
    for (const { col, key } of DATE_FIELDS) {
      entry[key] = parseDateFromExcel(row[col])
    }
    valid.push(entry)
  }

  return { valid, skipped }
}

const COLUMNS = [
  'Permit ID', 'Permit Name', 'Project',
  'Planned Start', 'Planned End',
  'Actual Start', 'Actual End',
  'Forecast Start', 'Forecast End',
]

export function exportPermitsToSheet(permits) {
  const rows = [COLUMNS]
  permits.forEach(p => {
    rows.push([
      p.id ?? '',
      p.name ?? '',
      p.projects?.name ?? '',
      formatDateForExcel(p.planned_start),
      formatDateForExcel(p.planned_finish),
      formatDateForExcel(p.actual_start),
      formatDateForExcel(p.actual_finish),
      formatDateForExcel(p.forecast_start),
      formatDateForExcel(p.forecast_finish),
    ])
  })
  return rows
}

export function parsePermitImportSheet(rows) {
  // rows[0] is header, rows[1..] are data
  const data = rows.slice(1)
  return data
    .filter(row => row[0] && String(row[0]).trim())
    .map(row => ({
      id:              String(row[0]).trim(),
      planned_start:   parseDateFromExcel(row[3] ?? ''),
      planned_finish:  parseDateFromExcel(row[4] ?? ''),
      actual_start:    parseDateFromExcel(row[5] ?? ''),
      actual_finish:   parseDateFromExcel(row[6] ?? ''),
      forecast_start:  parseDateFromExcel(row[7] ?? ''),
      forecast_finish: parseDateFromExcel(row[8] ?? ''),
    }))
}
