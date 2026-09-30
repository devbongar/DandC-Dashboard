import { jsPDF } from 'jspdf'

// Printable A4 report for Quality Findings (NCR).
// One report starts on a fresh page; a report longer than one page flows onto
// continuation pages rather than being clipped. Page numbers are stamped last,
// once the total page count is known.

const PAGE_W = 210
const PAGE_H = 297
const M      = 14
const CW     = PAGE_W - M * 2
const FOOT_H = 12 // reserved strip at the bottom for the page number

const RED    = [220, 38, 38]
const BORDER = [130, 130, 130]
const LABEL  = [110, 110, 110]

async function toDataUrl(url) {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = reject
    fr.readAsDataURL(blob)
  })
}

const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d) ? String(iso) : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

export async function buildNCRPrintPdf({ project, rows }) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = M

  const bottom = () => PAGE_H - M - FOOT_H

  // Starts a continuation page for the report currently being drawn
  const ensure = (h) => {
    if (y + h > bottom()) { pdf.addPage(); y = M; return true }
    return false
  }

  const reportHeader = (row, continued = false) => {
    pdf.setDrawColor(...BORDER)
    pdf.setLineWidth(0.4)
    pdf.rect(M, y, CW, 14)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(13)
    pdf.setTextColor(0, 0, 0)
    pdf.text('QUALITY FINDINGS REPORT', PAGE_W / 2, y + 6, { align: 'center', baseline: 'middle' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(90, 90, 90)
    const sub = [project?.name, project?.project_code].filter(Boolean).join('  ·  ')
    pdf.text(continued ? `${sub}  ·  (continued)` : sub, PAGE_W / 2, y + 10.5, { align: 'center', baseline: 'middle' })
    pdf.setTextColor(0, 0, 0)
    y += 14 + 5
  }

  // Label above, boxed value below -- value wraps and can push to a new page
  const field = (label, value, { width = CW, x = M, minLines = 1 } = {}) => {
    const text = (value ?? '').toString().trim()
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    const lines = text ? pdf.splitTextToSize(text, width - 4) : ['']
    const boxH = Math.max(minLines, lines.length) * 4.6 + 4

    ensure(4 + boxH)

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(6.5)
    pdf.setTextColor(...LABEL)
    pdf.text(label.toUpperCase(), x, y + 2.4, { baseline: 'middle' })
    y += 4

    pdf.setDrawColor(...BORDER)
    pdf.setLineWidth(0.2)
    pdf.rect(x, y, width, boxH)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(20, 20, 20)
    if (text) pdf.text(lines, x + 2, y + 4.4)
    y += boxH + 3.5
    return boxH
  }

  // A row of equal-width fields that always stay on the same line
  const fieldRow = (entries) => {
    const gap = 3
    const w = (CW - gap * (entries.length - 1)) / entries.length
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    const maxLines = Math.max(...entries.map(([, v]) =>
      (v ?? '').toString().trim() ? pdf.splitTextToSize(String(v), w - 4).length : 1))
    const boxH = maxLines * 4.6 + 4
    ensure(4 + boxH)

    const rowY = y
    entries.forEach(([label, value], i) => {
      const x = M + i * (w + gap)
      y = rowY
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(6.5)
      pdf.setTextColor(...LABEL)
      pdf.text(label.toUpperCase(), x, y + 2.4, { baseline: 'middle' })
      pdf.setDrawColor(...BORDER)
      pdf.setLineWidth(0.2)
      pdf.rect(x, y + 4, w, boxH)
      const text = (value ?? '').toString().trim()
      if (text) {
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(9)
        pdf.setTextColor(20, 20, 20)
        pdf.text(pdf.splitTextToSize(text, w - 4), x + 2, y + 4 + 4.4)
      }
    })
    y = rowY + 4 + boxH + 3.5
  }

  const sectionLabel = (text) => {
    ensure(9)
    pdf.setFillColor(...RED)
    pdf.rect(M, y, CW, 5, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.setTextColor(255, 255, 255)
    pdf.text(text.toUpperCase(), M + 2, y + 2.6, { baseline: 'middle' })
    pdf.setTextColor(0, 0, 0)
    y += 5 + 3
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    if (r > 0) { pdf.addPage(); y = M }
    const d = row.data ?? {}

    reportHeader(row)

    const itemLabel = d.group === 'Document' ? 'Document' : d.group === 'Materials' ? 'Material' : 'Activity'
    fieldRow([
      ['Group', d.group],
      [itemLabel, d.itemName],
      ['Date', fmtDate(row.date_of_inspection)],
      ['Status', row.status === 'closed' ? 'Closed' : 'Open'],
    ])

    sectionLabel('Quality Findings')
    field('Defect', d.defect)
    field('Description', row.description, { minLines: 3 })
    field('Root Cause', row.root_cause)
    fieldRow([
      ['Tower / Location', d.tower],
      ['Floor', d.floor],
      ['Zone', d.zone],
    ])

    const photos = d.photos ?? []
    if (photos.length) {
      ensure(8)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(6.5)
      pdf.setTextColor(...LABEL)
      pdf.text('PHOTOS', M, y + 2.4, { baseline: 'middle' })
      pdf.setTextColor(0, 0, 0)
      y += 5

      const gap = 4
      const cellW = (CW - gap) / 2
      let col = 0
      let rowTop = y
      let rowMaxH = 0

      for (const url of photos) {
        let data, props
        try {
          data = await toDataUrl(url)
          props = pdf.getImageProperties(data)
        } catch { continue } // unreachable photo -- skip it rather than fail the print

        const landscape = props.width > props.height
        const w = landscape ? CW : cellW
        const h = Math.min(w * (props.height / props.width), 95)
        const drawW = h * (props.width / props.height)

        // Landscape images take a full row of their own
        if (landscape && col === 1) { y = rowTop + rowMaxH + gap; col = 0; rowMaxH = 0; rowTop = y }
        if (col === 0) {
          rowTop = y
          if (ensure(h)) rowTop = y
          rowMaxH = 0
        }

        const x = M + col * (cellW + gap) + (landscape ? (CW - drawW) / 2 : (cellW - drawW) / 2)
        pdf.addImage(data, x, rowTop, drawW, h)
        rowMaxH = Math.max(rowMaxH, h)

        if (landscape) { y = rowTop + rowMaxH + gap; col = 0; rowMaxH = 0 }
        else if (col === 1) { y = rowTop + rowMaxH + gap; col = 0; rowMaxH = 0 }
        else col = 1
      }
      if (col === 1) y = rowTop + rowMaxH + gap
    }
  }

  // Page numbers, once the total is known
  const total = pdf.internal.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(120, 120, 120)
    pdf.text(`Page ${p} of ${total}`, PAGE_W / 2, PAGE_H - M + 2, { align: 'center', baseline: 'middle' })
  }

  return pdf
}
