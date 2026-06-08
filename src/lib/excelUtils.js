import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'

export async function downloadWorkbook(sheets, filename) {
  const wb = new ExcelJS.Workbook()

  for (const { sheetName, rows, columns, protectSheet, lockedCells } of sheets) {
    const ws = wb.addWorksheet(sheetName)

    // Column widths — when sheet is protected, default column style unlocks new cells
    ws.columns = columns.map(c => ({
      header: c.header,
      key:    c.key,
      width:  Math.max(c.header.length + 4, 16),
      ...(protectSheet ? { style: { protection: { locked: false } } } : {}),
    }))

    // Bold header row
    ws.getRow(1).font = { bold: true }

    // Data rows
    rows.forEach((row, rowIdx) => {
      const wsRow = ws.addRow(columns.map(c => {
        const v = row[c.key]
        if (v === null || v === undefined) return ''
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
          const [y, m, d] = v.split('-').map(Number)
          return `${m}/${d}/${y}`
        }
        return v
      }))

      if (protectSheet) {
        // Unlock every data cell first; then re-lock whichever are in the locked list
        wsRow.eachCell({ includeEmpty: true }, cell => {
          cell.protection = { locked: false }
        })
        const toLock = lockedCells?.[rowIdx] ?? []
        for (const colIdx of toLock) {
          const cell = wsRow.getCell(colIdx)
          cell.protection = { locked: true }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } }
        }
      }
    })

    if (protectSheet) {
      ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, insertRows: true })
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href       = url
  a.download   = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function parseWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true })
        const result = {}
        for (const name of wb.SheetNames) {
          result[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' })
        }
        resolve(result)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

function localDateStr(d) {
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dy = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dy}`
}

export function toDateStr(val) {
  if (!val && val !== 0) return null
  if (val instanceof Date && !isNaN(val)) return localDateStr(val)
  if (typeof val === 'string') {
    const s = val.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    const d = new Date(s)
    if (!isNaN(d)) return localDateStr(d)
  }
  return null
}

export function toFloat(val) {
  if (val === '' || val === null || val === undefined) return null
  const n = parseFloat(val)
  return isNaN(n) ? null : n
}

export function toInt(val) {
  if (val === '' || val === null || val === undefined) return null
  const n = parseInt(val)
  return isNaN(n) ? null : n
}
