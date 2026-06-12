# PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a futuristic floating "Export PDF" button to the Admin Dashboard that generates a 5-page PDF — page 1 is a live viewport snapshot, pages 2–5 are fully expanded per-panel captures.

**Architecture:** All logic lives in a new `PdfDownloadButton` component that uses `html2canvas` to capture DOM nodes and `jsPDF` to assemble them into a multi-page PDF with dynamic page heights. Each panel component receives an `id` prop so the button can target them directly. An expand/restore utility temporarily removes scroll/height constraints before capturing each panel.

**Tech Stack:** React 19, html2canvas ^1.4.1, jsPDF ^2.5.1, Tailwind CSS v3, Vite

---

## File Map

| File | Action |
|---|---|
| `src/components/PdfDownloadButton.jsx` | **Create** — floating button + expand/capture/restore + PDF assembly |
| `src/pages/dashboards/AdminDashboard.jsx` | **Modify** — add `id="dashboard-content"`, pass `id` props, render button |
| `src/components/ProjectPhasesBoard.jsx` | **Modify** — accept `id` prop, apply to root `<section>` |
| `src/components/UnitCompletionChart.jsx` | **Modify** — accept `id` prop, apply to root `<section>` |
| `src/components/IssuesTable.jsx` | **Modify** — accept `id` prop, apply to root `<section>` |
| `src/components/ComplianceTable.jsx` | **Modify** — accept `id` prop, apply to root `<section>` |
| `package.json` + `package-lock.json` | **Modify** — add html2canvas and jsPDF |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the two new packages**

```bash
npm install html2canvas jspdf
```

Expected output includes lines like:
```
added 2 packages
```

- [ ] **Step 2: Verify they appear in package.json**

Open `package.json` and confirm both are in `"dependencies"`:
```json
"html2canvas": "^1.4.1",
"jspdf": "^2.5.1"
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install html2canvas and jspdf for PDF export"
```

---

## Task 2: Add `id` Prop to All Four Panel Components

**Files:**
- Modify: `src/components/ProjectPhasesBoard.jsx:13,46`
- Modify: `src/components/UnitCompletionChart.jsx:139,282`
- Modify: `src/components/IssuesTable.jsx:46,125`
- Modify: `src/components/ComplianceTable.jsx:219,304`

Each component only needs two one-line changes: accept `id` in the function signature, and spread it onto the root `<section>`.

- [ ] **Step 1: Update ProjectPhasesBoard**

In `src/components/ProjectPhasesBoard.jsx`:

Line 13 — change:
```jsx
export default function ProjectPhasesBoard() {
```
to:
```jsx
export default function ProjectPhasesBoard({ id }) {
```

Line 46 — change:
```jsx
    <section className="mb-0 h-full flex flex-col bg-white rounded-xl border border-gray-200 shadow p-4">
```
to:
```jsx
    <section id={id} className="mb-0 h-full flex flex-col bg-white rounded-xl border border-gray-200 shadow p-4">
```

- [ ] **Step 2: Update UnitCompletionChart**

In `src/components/UnitCompletionChart.jsx`:

Line 139 — change:
```jsx
export default function UnitCompletionChart() {
```
to:
```jsx
export default function UnitCompletionChart({ id }) {
```

Line 282 — change:
```jsx
    <section className="bg-white rounded-xl border border-gray-200 shadow p-4 flex flex-col">
```
to:
```jsx
    <section id={id} className="bg-white rounded-xl border border-gray-200 shadow p-4 flex flex-col">
```

- [ ] **Step 3: Update IssuesTable**

In `src/components/IssuesTable.jsx`:

Line 46 — change:
```jsx
export default function IssuesTable() {
```
to:
```jsx
export default function IssuesTable({ id }) {
```

Line 125 — change:
```jsx
    <section className="mb-0 bg-white rounded-xl border border-gray-200 shadow p-4 flex flex-col" style={{ height: 600 }}>
```
to:
```jsx
    <section id={id} className="mb-0 bg-white rounded-xl border border-gray-200 shadow p-4 flex flex-col" style={{ height: 600 }}>
```

- [ ] **Step 4: Update ComplianceTable**

In `src/components/ComplianceTable.jsx`:

Line 219 — change:
```jsx
export default function ComplianceTable() {
```
to:
```jsx
export default function ComplianceTable({ id }) {
```

Line 304 — change:
```jsx
    <section className="mb-0 bg-white rounded-xl border border-gray-200 shadow p-4 flex flex-col h-[600px]">
```
to:
```jsx
    <section id={id} className="mb-0 bg-white rounded-xl border border-gray-200 shadow p-4 flex flex-col h-[600px]">
```

- [ ] **Step 5: Verify the app still renders**

```bash
npm run dev
```

Open the dashboard in a browser. All 4 panels should render exactly as before — no visual change expected.

- [ ] **Step 6: Commit**

```bash
git add src/components/ProjectPhasesBoard.jsx src/components/UnitCompletionChart.jsx src/components/IssuesTable.jsx src/components/ComplianceTable.jsx
git commit -m "feat: add id prop to dashboard panel components for PDF targeting"
```

---

## Task 3: Wire Up IDs in AdminDashboard

**Files:**
- Modify: `src/pages/dashboards/AdminDashboard.jsx`

- [ ] **Step 1: Update AdminDashboard**

Replace the entire file content with:

```jsx
import DashboardLayout from '../../components/DashboardLayout'
import useProfile from '../../hooks/useProfile'
import ProjectPhasesBoard from '../../components/ProjectPhasesBoard'
import IssuesTable from '../../components/IssuesTable'
import ComplianceTable from '../../components/ComplianceTable'
import UnitCompletionChart from '../../components/UnitCompletionChart'
import LoadingScreen from '../../components/LoadingScreen'
import useMinLoading from '../../hooks/useMinLoading'
import PdfDownloadButton from '../../components/PdfDownloadButton'

export default function AdminDashboard() {
  const { profile, loading } = useProfile()
  const showLoading = useMinLoading(loading)
  if (showLoading) return <LoadingScreen />

  return (
    <DashboardLayout profile={profile}>
      <div id="dashboard-content" className="space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="h-full [&>section]:mb-0 [&>section]:h-full"><ProjectPhasesBoard id="panel-phases" /></div>
          <div className="h-full [&>section]:mb-0 [&>section]:h-full"><UnitCompletionChart id="panel-completion" /></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          <div className="[&>section]:mb-0"><IssuesTable id="panel-issues" /></div>
          <div className="[&>section]:mb-0"><ComplianceTable id="panel-compliance" /></div>
        </div>
      </div>
      <PdfDownloadButton />
    </DashboardLayout>
  )
}
```

- [ ] **Step 2: Verify the dashboard still renders correctly**

```bash
npm run dev
```

Open the dashboard — all 4 panels visible, no button yet (PdfDownloadButton doesn't exist yet so this will error — that's expected, fix in Task 4).

- [ ] **Step 3: Commit**

```bash
git add src/pages/dashboards/AdminDashboard.jsx
git commit -m "feat: wire panel ids and PdfDownloadButton into AdminDashboard"
```

---

## Task 4: Create PdfDownloadButton Component

**Files:**
- Create: `src/components/PdfDownloadButton.jsx`

- [ ] **Step 1: Create the file with the full component**

Create `src/components/PdfDownloadButton.jsx` with this content:

```jsx
import { useState } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const PANEL_IDS = ['panel-phases', 'panel-completion', 'panel-issues', 'panel-compliance']

function getTodayLabel() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy} ${mm} ${dd}`
}

// Saves the full style attribute of each affected element, then removes
// overflow/height constraints so html2canvas sees the fully expanded content.
function expandPanel(panelEl) {
  const saved = []
  const all = [panelEl, ...panelEl.querySelectorAll('*')]
  for (const el of all) {
    const cs = window.getComputedStyle(el)
    const entry = { el, style: el.getAttribute('style') }
    let changed = false

    if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
      el.style.overflowY = 'visible'
      changed = true
    }
    if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') {
      el.style.overflowX = 'visible'
      changed = true
    }
    if (cs.maxHeight !== 'none') {
      el.style.maxHeight = 'none'
      changed = true
    }
    // Root panel: override fixed height from both inline styles and Tailwind h-[N] classes
    if (el === panelEl && cs.height !== 'auto') {
      el.style.height = 'auto'
      changed = true
    }
    // Non-root: only override inline height (e.g. style={{ height: 600 }})
    if (el !== panelEl && el.style.height && el.style.height !== 'auto') {
      el.style.height = 'auto'
      changed = true
    }

    if (changed) saved.push(entry)
  }
  return saved
}

// Restores each element's style attribute to exactly what it was before expand.
function restorePanel(saved) {
  for (const { el, style } of saved) {
    if (style === null) el.removeAttribute('style')
    else el.setAttribute('style', style)
  }
}

export default function PdfDownloadButton() {
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'done'

  const handleExport = async () => {
    if (status !== 'idle') return
    setStatus('loading')

    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth() // 297mm

      // Page 1 — viewport snapshot (no expansion)
      const dashContent = document.getElementById('dashboard-content')
      if (dashContent) {
        const canvas1 = await html2canvas(dashContent, {
          useCORS: true,
          logging: false,
          scale: window.devicePixelRatio || 1,
        })
        const imgH1 = (canvas1.height / canvas1.width) * pageW
        pdf.addImage(canvas1.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, pageW, imgH1)
      }

      // Pages 2–5 — one per panel, fully expanded
      for (const panelId of PANEL_IDS) {
        const panelEl = document.getElementById(panelId)
        if (!panelEl) continue

        const saved = expandPanel(panelEl)
        // Allow browser to re-layout before capturing
        await new Promise(r => setTimeout(r, 60))

        const canvas = await html2canvas(panelEl, {
          useCORS: true,
          logging: false,
          scale: window.devicePixelRatio || 1,
        })

        restorePanel(saved)

        const imgH = (canvas.height / canvas.width) * pageW
        pdf.addPage([pageW, imgH])
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, pageW, imgH)
      }

      pdf.save(`D&C Dashboard.${getTodayLabel()}.pdf`)
      setStatus('done')
      setTimeout(() => setStatus('idle'), 2000)
    } catch (err) {
      console.error('PDF export failed:', err)
      setStatus('idle')
    }
  }

  const isIdle = status === 'idle'
  const isLoading = status === 'loading'
  const isDone = status === 'done'

  return (
    <>
      <style>{`
        @keyframes pdf-glow-pulse {
          0%, 100% {
            box-shadow: 0 0 12px rgba(0,212,255,0.35), 0 0 28px rgba(0,212,255,0.12),
                        0 0 0 1px rgba(0,212,255,0.2), 0 6px 24px rgba(0,0,0,0.5);
          }
          50% {
            box-shadow: 0 0 22px rgba(0,212,255,0.6), 0 0 48px rgba(0,212,255,0.22),
                        0 0 0 1px rgba(0,212,255,0.4), 0 6px 24px rgba(0,0,0,0.5);
          }
        }
        @keyframes pdf-spin {
          to { transform: rotate(360deg); }
        }
        .pdf-btn-pulse { animation: pdf-glow-pulse 2.5s ease-in-out infinite; }
        .pdf-btn-loading {
          box-shadow: 0 0 20px rgba(237,96,85,0.55), 0 0 44px rgba(237,96,85,0.2),
                      0 0 0 1px rgba(237,96,85,0.35), 0 6px 24px rgba(0,0,0,0.5) !important;
          animation: none !important;
        }
        .pdf-btn-done {
          box-shadow: 0 0 20px rgba(74,222,128,0.5), 0 0 44px rgba(74,222,128,0.18),
                      0 0 0 1px rgba(74,222,128,0.3), 0 6px 24px rgba(0,0,0,0.5) !important;
          animation: none !important;
        }
        .pdf-spinner { animation: pdf-spin 0.75s linear infinite; }
      `}</style>

      <button
        onClick={handleExport}
        disabled={!isIdle}
        title="Download Dashboard PDF"
        className={[
          'fixed bottom-6 right-6 z-50',
          'flex items-center gap-2.5 px-5 py-3 rounded-full',
          'text-sm font-semibold select-none transition-transform duration-150',
          isIdle ? 'cursor-pointer hover:scale-105 active:scale-95 pdf-btn-pulse' : 'cursor-not-allowed',
          isLoading ? 'pdf-btn-loading' : '',
          isDone ? 'pdf-btn-done' : '',
        ].join(' ')}
        style={{
          background: 'linear-gradient(135deg, #08081a 0%, #0e0e28 50%, #08081a 100%)',
          border: isLoading
            ? '1px solid rgba(237,96,85,0.4)'
            : isDone
            ? '1px solid rgba(74,222,128,0.4)'
            : '1px solid rgba(0,212,255,0.3)',
        }}
      >
        {/* Icon */}
        {isLoading ? (
          <svg className="pdf-spinner w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" strokeWidth={2.5}>
            <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" stroke="rgba(237,96,85,0.95)" />
          </svg>
        ) : isDone ? (
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="rgba(74,222,128,0.95)" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round"
              stroke="rgba(0,212,255,0.9)"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z"
            />
          </svg>
        )}

        {/* Label */}
        <span style={{
          color: isLoading
            ? 'rgba(237,96,85,0.95)'
            : isDone
            ? 'rgba(74,222,128,0.95)'
            : 'rgba(180,235,255,0.95)',
          letterSpacing: '0.02em',
        }}>
          {isLoading ? 'Generating…' : isDone ? 'Downloaded!' : 'Export PDF'}
        </span>
      </button>
    </>
  )
}
```

- [ ] **Step 2: Start the dev server and verify the button appears**

```bash
npm run dev
```

Open the Admin Dashboard. You should see:
- A dark pill button fixed at the bottom-right corner
- A cyan glow pulse animation on it
- Label: "Export PDF" with a PDF document icon

- [ ] **Step 3: Click Export PDF and verify the download**

Click the button. Expected sequence:
1. Button turns red/orange, spinner appears, label changes to "Generating…"
2. After a few seconds (depends on data volume), a file download is triggered
3. Button turns green, label changes to "Downloaded!", then returns to idle after 2 seconds
4. File saved as `D&C Dashboard.YYYY MM DD.pdf` (e.g. `D&C Dashboard.2026 06 12.pdf`)

- [ ] **Step 4: Open the PDF and verify structure**

Open the downloaded PDF and confirm:
- **Page 1** — full dashboard screenshot showing all 4 panels as they appear on screen
- **Page 2** — ProjectPhasesBoard with all phase cards visible (no cut-off cards)
- **Page 3** — UnitCompletionChart fully visible
- **Page 4** — IssuesTable with all rows visible (not clipped to 600px)
- **Page 5** — ComplianceTable with all rows visible (not clipped to 600px)

- [ ] **Step 5: Commit**

```bash
git add src/components/PdfDownloadButton.jsx
git commit -m "feat: add futuristic floating PDF export button to Admin Dashboard"
```
