# PDF Export Feature — Design Spec

**Date:** 2026-06-12
**Status:** Approved

## Summary

Add a floating "Export PDF" button to the Dashboard page that generates a multi-page PDF of all dashboard content.

---

## PDF Structure

| Page | Content | Capture Method |
|---|---|---|
| 1 | Full dashboard viewport snapshot (as seen on screen) | `html2canvas` on `#dashboard-content` wrapper |
| 2 | ProjectPhasesBoard — fully expanded | Expand scroll containers → capture → restore |
| 3 | UnitCompletionChart — full height | Expand → capture → restore |
| 4 | IssuesTable — all rows visible | Expand → capture → restore |
| 5 | ComplianceTable — all rows visible | Expand → capture → restore |

**File name:** `D&C Dashboard.YYYY MM DD.pdf` (e.g. `D&C Dashboard.2026 06 12.pdf`)

**Page orientation:** A4 landscape for all pages.

**Scale:** Each captured canvas is fitted to fill the full A4 landscape page width, maintaining aspect ratio (no cropping).

---

## Floating Button

**Placement:** `fixed bottom-6 right-6 z-50` — always visible over dashboard content.

**Futuristic visual design:**
- Dark pill shape (`bg-[#1a1a2e]` or similar deep navy/charcoal)
- Animated glowing ring using brand red `#ed6055` with a cyan `#00d4ff` accent
- PDF icon (arrow-down into document) + label "Export PDF"
- Idle state: subtle continuous pulse glow animation on the ring
- Loading state: spinning arc animation replacing the pulse, label changes to "Generating…"
- Disabled during generation (no double-clicks)
- Tooltip on hover: "Download Dashboard PDF"

**States:**
- `idle` — pulse glow, clickable
- `loading` — spinner arc, label "Generating…", pointer-events none
- `done` — brief checkmark flash (300ms), then returns to idle

---

## Expand-Capture-Restore Pattern

For pages 2–5, before calling `html2canvas` on each panel:

1. Find all elements within the panel that have `overflow-y: auto`, `overflow-y: scroll`, or explicit `maxHeight` constraints.
2. Save their current inline styles.
3. Set `overflow: visible` and `maxHeight: none` on each.
4. Call `html2canvas` on the panel's root element.
5. Restore all saved inline styles.

Each panel is identified by a stable HTML `id` attribute added to its root `<section>` element:
- `id="panel-phases"` — ProjectPhasesBoard
- `id="panel-completion"` — UnitCompletionChart
- `id="panel-issues"` — IssuesTable
- `id="panel-compliance"` — ComplianceTable

---

## Generation Flow

1. User clicks floating button → state = `loading`
2. Capture Page 1: `html2canvas(document.getElementById('dashboard-content'))` at the current scroll position (no scroll manipulation)
3. For each panel id in order `['panel-phases', 'panel-completion', 'panel-issues', 'panel-compliance']`:
   a. Expand scroll containers (see pattern above)
   b. `html2canvas(panelEl, { useCORS: true, logging: false })`
   c. Restore scroll containers
   d. Add canvas as new PDF page
4. Call `pdf.save('D&C Dashboard.YYYY MM DD.pdf')` where date is today's local date
5. State → `done` (checkmark flash) → `idle`

---

## Files

| File | Action | Purpose |
|---|---|---|
| `src/components/PdfDownloadButton.jsx` | Create | Floating button + PDF generation logic |
| `src/pages/dashboards/AdminDashboard.jsx` | Modify | Add `id="dashboard-content"` to content wrapper, add panel `id` props, render `<PdfDownloadButton />` |
| `src/components/ProjectPhasesBoard.jsx` | Modify | Accept and apply `id` prop on root `<section>` |
| `src/components/UnitCompletionChart.jsx` | Modify | Accept and apply `id` prop on root `<section>` |
| `src/components/IssuesTable.jsx` | Modify | Accept and apply `id` prop on root `<section>` |
| `src/components/ComplianceTable.jsx` | Modify | Accept and apply `id` prop on root `<section>` |
| `package.json` | Modify | Add `html2canvas`, `jspdf` dependencies |

---

## Dependencies

```bash
npm install html2canvas jspdf
```

- `html2canvas` ^1.4.1 — DOM-to-canvas rendering
- `jspdf` ^2.5.1 — PDF assembly and download

---

## Scope

**In scope:**
- Admin dashboard only (`AdminDashboard.jsx`)
- 5-page PDF (1 viewport + 4 expanded panels)
- Floating button with futuristic animated style
- Client-side generation, no backend

**Out of scope:**
- Approver / Updater / Viewer dashboard variants
- PDF header/footer branding (logo, page numbers)
- Custom page size selection
- ProjectDetailModal export
