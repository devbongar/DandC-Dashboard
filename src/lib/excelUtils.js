import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'

export async function downloadWorkbook(sheets, filename) {
  const wb = new ExcelJS.Workbook()

  for (const { sheetName, rows, columns, protectSheet, lockedCells } of sheets) {
    const ws = wb.addWorksheet(sheetName)

    // Column widths -- when sheet is protected, default column style unlocks new cells
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

export async function downloadActualTemplate(filename = 'actual-import-template.xlsx') {
  const wb = new ExcelJS.Workbook()

  // -- Instructions sheet ---------------------------------------------------
  const ins = wb.addWorksheet('Instructions')
  ins.columns = [{ width: 22 }, { width: 68 }]

  const title = ins.addRow(['Actual Import Template -- Instructions'])
  ins.mergeCells('A1:B1')
  title.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
  title.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFED6055' } }
  title.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  title.height = 24

  ins.addRow([])

  const addRow = (label, text) => {
    const r = ins.addRow([label, text])
    r.getCell(1).font = { bold: true, color: { argb: 'FF111827' } }
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
    r.getCell(2).font = { color: { argb: 'FF374151' } }
    r.getCell(2).alignment = { wrapText: true }
    r.height = 32
  }

  addRow('Period column',   'Use m/d/yyyy format -- e.g. 1/1/2026 · 12/31/2026. Other accepted: 2026-01-01 · Jan \'26 · January 2026')
  addRow('Actual % column', 'Enter the CUMULATIVE % at the end of each period (0–100). The system converts to increments automatically.')
  addRow('Column headers',  'Do not rename "Period" or "Actual %" -- these exact names are required for import to work.')
  addRow('Sheet name',      'Any sheet name works -- the first sheet in the file is used.')
  addRow('Example',         'If Jan=5%, Feb=13%, Mar=23% cumulative -- enter 5, 13, 23 (not 5, 8, 10).')

  ins.addRow([])

  const exHeader = ins.addRow(['Example data:'])
  exHeader.getCell(1).font = { bold: true, color: { argb: 'FF111827' } }

  const exColHeader = ins.addRow(['Period', 'Actual %'])
  exColHeader.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B7280' } }
  })

  ;[['1/1/2026', 5], ['2/1/2026', 13], ['3/1/2026', 23]].forEach(([p, v]) => {
    const r = ins.addRow([p, v])
    r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } } })
  })

  // -- Actual Data sheet (fill in here) ------------------------------------
  const ws = wb.addWorksheet('Actual Data')
  ws.columns = [
    { header: 'Period',   key: 'period', width: 18 },
    { header: 'Actual %', key: 'actual', width: 14 },
  ]

  const header = ws.getRow(1)
  header.font = { bold: true, color: { argb: 'FF111827' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  header.height = 20

  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    ws.addRow([`${d.getMonth() + 1}/1/${d.getFullYear()}`, ''])
  }

  ws.addRow([])
  const note = ws.addRow(['← Add more rows below as needed', ''])
  note.getCell(1).font = { italic: true, color: { argb: 'FF9CA3AF' } }

  const buffer = await wb.xlsx.writeBuffer()
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href       = url
  a.download   = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadForecastTemplate(filename = 'forecast-import-template.xlsx') {
  const wb = new ExcelJS.Workbook()

  const ins = wb.addWorksheet('Instructions')
  ins.columns = [{ width: 22 }, { width: 68 }]

  const title = ins.addRow(['Forecast Import Template -- Instructions'])
  ins.mergeCells('A1:B1')
  title.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
  title.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFED6055' } }
  title.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  title.height = 24
  ins.addRow([])

  const addRow = (label, text) => {
    const r = ins.addRow([label, text])
    r.getCell(1).font = { bold: true, color: { argb: 'FF111827' } }
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
    r.getCell(2).font = { color: { argb: 'FF374151' } }
    r.getCell(2).alignment = { wrapText: true }
    r.height = 32
  }

  addRow('Period column',     'Use m/d/yyyy format -- e.g. 1/1/2026 · 12/31/2026. Other accepted: 2026-01-01 · Jan \'26 · January 2026')
  addRow('Forecast % column', 'Enter the CUMULATIVE % at the end of each period (0–100). The system converts to increments automatically.')
  addRow('Column headers',    'Do not rename "Period" or "Forecast %" -- these exact names are required for import to work.')
  addRow('Sheet name',        'Any sheet name works -- the first sheet in the file is used.')
  addRow('Example',           'If Jan=5%, Feb=13%, Mar=23% cumulative -- enter 5, 13, 23 (not 5, 8, 10).')

  ins.addRow([])
  const exHeader = ins.addRow(['Example data:'])
  exHeader.getCell(1).font = { bold: true, color: { argb: 'FF111827' } }
  const exColHeader = ins.addRow(['Period', 'Forecast %'])
  exColHeader.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B7280' } }
  })
  ;[['1/1/2026', 5], ['2/1/2026', 13], ['3/1/2026', 23]].forEach(([p, v]) => {
    const r = ins.addRow([p, v])
    r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } } })
  })

  const ws = wb.addWorksheet('Forecast Data')
  ws.columns = [
    { header: 'Period',     key: 'period',   width: 18 },
    { header: 'Forecast %', key: 'forecast', width: 14 },
  ]
  const header = ws.getRow(1)
  header.font = { bold: true, color: { argb: 'FF111827' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  header.height = 20

  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    ws.addRow([`${d.getMonth() + 1}/1/${d.getFullYear()}`, ''])
  }
  ws.addRow([])
  const note = ws.addRow(['← Add more rows below as needed', ''])
  note.getCell(1).font = { italic: true, color: { argb: 'FF9CA3AF' } }

  const buffer = await wb.xlsx.writeBuffer()
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href       = url
  a.download   = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadBaselineTemplate(filename = 'baseline-import-template.xlsx') {
  const wb = new ExcelJS.Workbook()

  // -- Instructions sheet ---------------------------------------------------
  const ins = wb.addWorksheet('Instructions')
  ins.columns = [{ width: 22 }, { width: 68 }]

  const title = ins.addRow(['Baseline Import Template -- Instructions'])
  ins.mergeCells('A1:B1')
  title.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
  title.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFED6055' } }
  title.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  title.height = 24

  ins.addRow([])

  const addRow = (label, text) => {
    const r = ins.addRow([label, text])
    r.getCell(1).font = { bold: true, color: { argb: 'FF111827' } }
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
    r.getCell(2).font = { color: { argb: 'FF374151' } }
    r.getCell(2).alignment = { wrapText: true }
    r.height = 32
  }

  addRow('Period column',    'Use m/d/yyyy format -- e.g. 1/1/2026 · 12/31/2026. Other accepted: 2026-01-01 · Jan \'26 · January 2026')
  addRow('Planned % column', 'Enter the CUMULATIVE % at the end of each period (0–100). The system converts to increments automatically.')
  addRow('Column headers',   'Do not rename "Period" or "Planned %" -- these exact names are required for import to work.')
  addRow('Sheet name',       'Keep this sheet named "Baseline Data". If renamed, the first sheet in the file will be used instead.')
  addRow('Example',          'If Jan=5%, Feb=13%, Mar=23% cumulative -- enter 5, 13, 23 (not 5, 8, 10).')

  ins.addRow([])

  const exHeader = ins.addRow(['Example data:'])
  exHeader.getCell(1).font = { bold: true, color: { argb: 'FF111827' } }

  const exColHeader = ins.addRow(['Period', 'Planned %'])
  exColHeader.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B7280' } }
  })

  ;[['1/1/2026', 5], ['2/1/2026', 13], ['3/1/2026', 23]].forEach(([p, v]) => {
    const r = ins.addRow([p, v])
    r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } } })
  })

  // -- Baseline Data sheet (fill in here) -----------------------------------
  const ws = wb.addWorksheet('Baseline Data')
  ws.columns = [
    { header: 'Period',    key: 'period',  width: 18 },
    { header: 'Planned %', key: 'planned', width: 14 },
  ]

  const header = ws.getRow(1)
  header.font = { bold: true, color: { argb: 'FF111827' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  header.height = 20

  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    ws.addRow([`${d.getMonth() + 1}/1/${d.getFullYear()}`, ''])
  }

  // Add a note row after the 12 months
  ws.addRow([])
  const note = ws.addRow(['← Add more rows below as needed', ''])
  note.getCell(1).font = { italic: true, color: { argb: 'FF9CA3AF' } }

  const buffer = await wb.xlsx.writeBuffer()
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href       = url
  a.download   = filename
  a.click()
  URL.revokeObjectURL(url)
}
