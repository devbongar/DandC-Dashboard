import { jsPDF, AcroFormTextField, AcroFormCheckBox } from 'jspdf'

// Editable (AcroForm) PDF for NCR / QOR quality reports.
// Laid out in mm on A4 portrait: every data field is a real PDF form field so the
// document can still be filled in outside the app. Signatures stay as drawn images.

const PAGE_W = 210
const PAGE_H = 297
const M      = 10
const CW     = PAGE_W - M * 2

const RED    = [220, 38, 38]
const GRAY   = [229, 231, 235]
const BORDER = [130, 130, 130]

// Fields inherit the AcroForm root's default appearance, whose stock value is
// "0 Tf" (auto-size) -- that renders huge text in tall cells. Pin it instead.
const FIELD_FONT_SIZE = 8

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

export async function buildQAReportPdf({ type, f, photoUrls = [] }) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = M

  const ensure = (h) => {
    if (y + h > PAGE_H - M) { pdf.addPage(); y = M }
  }

  const cell = (x, w, h, { fill } = {}) => {
    if (fill) { pdf.setFillColor(...fill); pdf.rect(x, y, w, h, 'F') }
    pdf.setDrawColor(...BORDER)
    pdf.setLineWidth(0.2)
    pdf.rect(x, y, w, h)
  }

  const label = (text, x, w, h, { bold = false, size = 7, color = [60, 60, 60] } = {}) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    pdf.setTextColor(...color)
    pdf.text(String(text), x + 1.5, y + h / 2, { baseline: 'middle', maxWidth: w - 3 })
  }

  // boxH shrinks the editable box inside a taller cell and centres it, so a
  // single line of text doesn't sit in a huge field box.
  const textField = (name, x, w, h, value, { multiline = false, size = FIELD_FONT_SIZE, boxH } = {}) => {
    const fh = boxH ? Math.min(boxH, h - 1.2) : h - 1.2
    const fy = y + (h - fh) / 2
    const t = new AcroFormTextField()
    t.Rect = [x + 0.6, fy, w - 1.2, fh]
    t.fieldName = name
    t.value = value == null ? '' : String(value)
    t.fontSize = size
    t.maxFontSize = size
    if (multiline) t.multiline = true
    pdf.addField(t)
  }

  const checkBox = (name, x, cy, checked, size = 3.5) => {
    const c = new AcroFormCheckBox()
    c.Rect = [x, cy, size, size]
    c.fieldName = name
    c.appearanceState = checked ? 'On' : 'Off'
    pdf.addField(c)
  }

  // A checkbox plus its caption, returns the x cursor after it
  const checkOption = (name, x, cy, text, checked) => {
    checkBox(name, x, cy, checked)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(40, 40, 40)
    pdf.text(text, x + 5, cy + 1.8, { baseline: 'middle' })
    return x + 5 + pdf.getTextWidth(text) + 6
  }

  const sectionBar = (title) => {
    ensure(10)
    pdf.setFillColor(...RED)
    pdf.rect(M, y, CW, 5.5, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7.5)
    pdf.setTextColor(255, 255, 255)
    pdf.text(title.toUpperCase(), M + 2, y + 2.9, { baseline: 'middle' })
    pdf.setTextColor(0, 0, 0)
    y += 5.5 + 1.5
  }

  const caption = (text, { size = 7, bold = true, gap = 1.2 } = {}) => {
    ensure(5)
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    pdf.setTextColor(70, 70, 70)
    pdf.text(text, M, y + 2.4, { baseline: 'middle', maxWidth: CW })
    pdf.setTextColor(0, 0, 0)
    y += 4 + gap
  }

  // Two label/value pairs per row
  const infoRow = (l1, n1, v1, l2, n2, v2) => {
    const h = 7
    const LW = 34, VW = 61
    ensure(h)
    cell(M, LW, h, { fill: GRAY });        label(l1, M, LW, h, { bold: true })
    cell(M + LW, VW, h);                    textField(n1, M + LW, VW, h, v1)
    cell(M + LW + VW, LW, h, { fill: GRAY }); label(l2, M + LW + VW, LW, h, { bold: true })
    cell(M + LW * 2 + VW, VW, h);           textField(n2, M + LW * 2 + VW, VW, h, v2)
    y += h
  }

  const signatureHeader = () => {
    const h = 5
    const W = [30, 55, 65, 40]
    ensure(h)
    let x = M
    ;['', 'PRINTED NAME', 'SIGNATURE', 'DATE'].forEach((t, i) => {
      cell(x, W[i], h, { fill: GRAY })
      if (t) label(t, x, W[i], h, { bold: true, size: 6 })
      x += W[i]
    })
    y += h
  }

  const signatureRow = (labelText, prefix, name, sign, date) => {
    const h = 15
    const W = [30, 55, 65, 40]
    ensure(h)
    let x = M
    cell(x, W[0], h, { fill: GRAY }); label(labelText, x, W[0], h, { bold: true }); x += W[0]
    cell(x, W[1], h);                 textField(`${prefix}_name`, x, W[1], h, name, { boxH: 6 }); x += W[1]
    cell(x, W[2], h)
    let drewSignature = false
    if (sign) {
      try {
        const props = pdf.getImageProperties(sign)
        const maxW = W[2] - 6, maxH = h - 4
        const ratio = Math.min(maxW / props.width, maxH / props.height)
        const iw = props.width * ratio, ih = props.height * ratio
        pdf.addImage(sign, 'PNG', x + (W[2] - iw) / 2, y + (h - ih) / 2, iw, ih)
        drewSignature = true
      } catch { /* unreadable signature image -- fall through to a typed field */ }
    }
    // Unsigned: leave a typable field so the PDF can be signed by name outside the app
    if (!drewSignature) textField(`${prefix}_sign`, x, W[2], h, '', { boxH: 6 })
    x += W[2]
    cell(x, W[3], h); textField(`${prefix}_date`, x, W[3], h, date, { boxH: 6 })
    y += h
  }

  const actionTable = (title, prefix, rows) => {
    const AW = 150, DW = 40, HH = 5.5, RH = 10
    ensure(HH + RH)
    cell(M, AW, HH, { fill: GRAY });      label(title, M, AW, HH, { bold: true, size: 6.5 })
    cell(M + AW, DW, HH, { fill: GRAY }); label('DUE DATE', M + AW, DW, HH, { bold: true, size: 6.5 })
    y += HH
    rows.forEach((r, i) => {
      ensure(RH)
      cell(M, AW, RH);      textField(`${prefix}_${i}_action`, M, AW, RH, r.action, { multiline: true, size: 7.5 })
      cell(M + AW, DW, RH); textField(`${prefix}_${i}_due`, M + AW, DW, RH, r.dueDate)
      y += RH
    })
    y += 2
  }

  const reviewBlock = (title, prefix, review) => {
    ensure(8)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.setTextColor(40, 40, 40)
    pdf.text(title, M, y + 2.4, { baseline: 'middle' })
    let cx = M + 95
    cx = checkOption(`${prefix}_accepted`, cx, y + 0.6, 'Accepted', review?.status === 'accepted')
    checkOption(`${prefix}_rejected`, cx, y + 0.6, 'Rejected', review?.status === 'rejected')
    y += 5.5

    const dh = 16
    ensure(dh)
    cell(M, CW, dh); textField(`${prefix}_details`, M, CW, dh, review?.details, { multiline: true, size: 7.5 })
    y += dh

    signatureRow('Reviewed By', prefix, review?.reviewedBy, review?.sign, review?.signDate)
    y += 2
  }

  // ── Title ────────────────────────────────────────────────────────────────────
  pdf.setDrawColor(...BORDER)
  pdf.setLineWidth(0.4)
  pdf.rect(M, y, CW, 12)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14)
  pdf.setTextColor(0, 0, 0)
  pdf.text(`${type.title.toUpperCase()} (${type.abbr})`, PAGE_W / 2, y + 6, { align: 'center', baseline: 'middle' })
  y += 12 + 3

  // ── Section 1 ────────────────────────────────────────────────────────────────
  sectionBar('Section 1: General Information')
  infoRow('Project Name', 'projectName', f.projectName, `${type.abbr} Reference No.`, 'refNo', f.refNo)
  infoRow('Contract Work Pkg.', 'contractWorkPkg', f.contractWorkPkg, 'Contract Scope/Activity', 'contractScope', f.contractScope)
  infoRow('Project Location', 'projectLocation', f.projectLocation, 'Date of Inspection', 'dateOfInspection', f.dateOfInspection)
  y += 2
  signatureHeader()
  signatureRow('Issued By',   'issuedBy',   f.issuedBy,   f.issuedBySign,   f.issuedByDate)
  signatureRow('Approved By', 'approvedBy', f.approvedBy, f.approvedBySign, f.approvedByDate)
  signatureRow('Issued To',   'issuedTo',   f.issuedTo,   f.issuedToSign,   f.issuedToDate)
  signatureRow('Received By', 'receivedBy', f.receivedBy, f.receivedBySign, f.receivedByDate)
  y += 3

  // ── Section 2 ────────────────────────────────────────────────────────────────
  sectionBar('Section 2: Details of Non-Conformance')
  caption('Description of Non-Compliance (What, Where, When, How big, Quantify)')
  const descH = 30
  ensure(descH)
  cell(M, CW, descH); textField('description', M, CW, descH, f.description, { multiline: true })
  y += descH + 3

  if (type.categories) {
    caption(`2.2 Category / Classification of ${type.abbr}`)
    let cx = M
    let rowStart = y
    type.categories.forEach((c, i) => {
      const w = 5 + pdf.getTextWidth(c) + 6
      if (cx + w > M + CW) { cx = M; y += 6 }
      ensure(6)
      checkOption(`category_${i}`, cx, y + 0.6, c, !!f.categories?.[c])
      cx += w
    })
    y += 6 + (y > rowStart ? 0 : 0)
    y += 2
  }

  if (photoUrls.length) {
    caption('Attached Photos')
    const per = 4, bw = (CW - 3 * 3) / per, bh = bw * 0.72
    let col = 0
    for (const url of photoUrls) {
      if (col === 0) ensure(bh + 2)
      const x = M + col * (bw + 3)
      try {
        const data = await toDataUrl(url)
        const props = pdf.getImageProperties(data)
        const ratio = Math.min(bw / props.width, bh / props.height)
        const iw = props.width * ratio, ih = props.height * ratio
        pdf.setDrawColor(...BORDER)
        pdf.rect(x, y, bw, bh)
        pdf.addImage(data, x + (bw - iw) / 2, y + (bh - ih) / 2, iw, ih)
      } catch { /* skip unreadable photo */ }
      col += 1
      if (col === per) { col = 0; y += bh + 3 }
    }
    if (col !== 0) y += bh + 3
  }

  // ── Section 3 ────────────────────────────────────────────────────────────────
  sectionBar('Section 3: Root Cause Analysis')
  const rcH = 26
  ensure(rcH)
  cell(M, CW, rcH); textField('rootCause', M, CW, rcH, f.rootCause, { multiline: true })
  y += rcH + 3

  // ── Section 4 ────────────────────────────────────────────────────────────────
  sectionBar('Section 4: Proposed Corrective and Preventive Actions')
  caption('4.1 Proposed Corrective Action/s')
  ensure(6)
  let cx4 = M
  cx4 = checkOption('corr_demolish', cx4, y + 0.6, 'Demolish', !!f.correctiveType?.demolish)
  cx4 = checkOption('corr_repair',   cx4, y + 0.6, 'Repair',   !!f.correctiveType?.repair)
  cx4 = checkOption('corr_others',   cx4, y + 0.6, 'Others (Pls. specify)', !!f.correctiveType?.others)
  cell(cx4, M + CW - cx4, 5.5)
  textField('corr_others_text', cx4, M + CW - cx4, 5.5, f.correctiveType?.othersText, { size: 7.5 })
  y += 7
  actionTable('CORRECTIVE ACTIONS', 'corr', f.correctiveRows ?? [])
  caption('4.2 Proposed Preventive Action/s')
  actionTable('PREVENTIVE ACTIONS', 'prev', f.preventiveRows ?? [])
  signatureHeader()
  signatureRow('Proposed By', 'proposedBy', f.proposedBy, f.proposedBySign, f.proposedByDate)
  y += 3

  // ── Section 5 ────────────────────────────────────────────────────────────────
  sectionBar('Section 5: Corrective & Preventive Action/s Review & Acceptance')
  reviewBlock('5.1 Cause of Non-Conformance',   'rev_cause', f.reviewCause)
  reviewBlock('5.2 Proposed Corrective Action/s', 'rev_corr', f.reviewCorrective)
  reviewBlock('5.3 Proposed Preventive Action/s', 'rev_prev', f.reviewPreventive)

  // ── Section 6 ────────────────────────────────────────────────────────────────
  sectionBar(`Section 6: Action Verification, Acceptance & ${type.abbr} Close Out`)
  const yesNo = (name, text, value) => {
    ensure(6)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(40, 40, 40)
    pdf.text(text, M, y + 2.4, { baseline: 'middle' })
    let x = M + 110
    x = checkOption(`${name}_yes`, x, y + 0.6, 'YES', value === 'yes')
    checkOption(`${name}_no`, x, y + 0.6, 'NO', value === 'no')
    y += 6
  }
  yesNo('closeOutClosed', '6.1 All action items were closed', f.closeOutClosed)
  yesNo('closeOutVerified', '6.2 All actions were verified and accepted', f.closeOutVerified)
  y += 1
  signatureHeader()
  signatureRow(`${type.abbr} Close Out By`, 'closeOut', f.closeOutBy, f.closeOutSign, f.closeOutDate)
  y += 4

  // ── Notes ────────────────────────────────────────────────────────────────────
  ensure(24)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(6.5)
  pdf.setTextColor(...RED)
  pdf.text('NOTES:', M, y)
  pdf.setTextColor(90, 90, 90)
  pdf.setFont('helvetica', 'normal')
  y += 3
  const notes = [
    `1. Evidence (Photos/Documents) of the closed action item must be attached to the ${type.abbr} upon submission.`,
    `2. After the ${type.abbr} closed-out, Construction Management team keeps the hard copy and encode the ${type.abbr} on the ${type.abbr} Log.`,
    `3. Compliance of the Contractor in the issued ${type.abbr} does not construe as acceptance of the project and does not relieve the Contractor from their responsibilities pertaining to the Guarantee of the completed items of works, as stipulated in the Contract.`,
    `4. ${type.abbr} Reference Number: PH1.D&C.Project Code.Current Month.Current Year.${type.abbr} no.`,
  ]
  for (const n of notes) {
    const lines = pdf.splitTextToSize(n, CW)
    ensure(lines.length * 2.8)
    pdf.text(lines, M, y)
    y += lines.length * 2.8 + 0.8
  }

  // Text fields suppress their own /DA and fall back to the AcroForm root's,
  // which defaults to auto-size. Pin it so every field keeps a fixed font size
  // even after a viewer regenerates the field appearance on edit.
  const root = pdf.internal.acroformPlugin?.acroFormDictionaryRoot
  if (root) {
    const fontId = pdf.internal.getFont('helvetica', 'normal').id
    root.DA = `/${fontId} ${FIELD_FONT_SIZE} Tf 0 g`
  }

  return pdf
}

