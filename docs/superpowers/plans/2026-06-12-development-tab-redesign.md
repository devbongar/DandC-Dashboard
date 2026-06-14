# Development Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename all "Tower/Building" labels to "Tower/Location", add a summary strip per selected tower, rename section headers to "Residential Units" / "Parking Units", and improve `BulkAddFloorsModal` with optional M4/M5 date ranges and a live preview.

**Architecture:** All changes are in `src/components/ProjectDetailModal.jsx`. No new files, no DB changes. `ProjectFloorSchedule` and `ParkingFloorSchedule` each gain an `onSummaryChange` callback to bubble floor/unit totals up to `CondominiumDevelopmentTab`, which renders the summary strip. `BulkAddFloorsModal` gains date range fields and a live preview line.

**Tech Stack:** React 19, Tailwind CSS v3, Supabase (no new queries — summary is derived from already-loaded data)

---

## File Map

| File | Changes |
|---|---|
| `src/components/ProjectDetailModal.jsx:799` | Change "Add Building" label |
| `src/components/ProjectDetailModal.jsx:828–888` | Improve `BulkAddFloorsModal` |
| `src/components/ProjectDetailModal.jsx:891–1031` | Add `onSummaryChange` callback + rename section header |
| `src/components/ProjectDetailModal.jsx:1033–1173` | Add `onSummaryChange` callback + rename section header + "Slots"→"Spaces" |
| `src/components/ProjectDetailModal.jsx:1330–1355` | Summary strip + wire `onSummaryChange` |

---

## Task 1: Rename "Add Building" → "Add Tower/Location"

**Files:**
- Modify: `src/components/ProjectDetailModal.jsx:799`

- [ ] **Step 1: Open the file and locate the button label**

The button is at line 799:
```jsx
<PlusIcon /> Add Building
```

- [ ] **Step 2: Change the label**

Old text (line 799):
```jsx
          <PlusIcon /> Add Building
```

New text:
```jsx
          <PlusIcon /> Add Tower/Location
```

- [ ] **Step 3: Verify the placeholder is still sensible**

The input placeholder at line 811 reads `"e.g. Tower A"` — leave it as-is; it's already appropriate for the Tower/Location concept.

---

## Task 2: Rename Section Headers and "Slots" → "Spaces"

**Files:**
- Modify: `src/components/ProjectDetailModal.jsx:940` (ProjectFloorSchedule header)
- Modify: `src/components/ProjectDetailModal.jsx:1082` (ParkingFloorSchedule header)
- Modify: `src/components/ProjectDetailModal.jsx:1095` (Parking column header)

- [ ] **Step 1: Rename Residential section header**

Find at line 940:
```jsx
      <SectionHeader title="Floor Schedule (M4 / M5)" action={isAdmin && !adding && (
```

Replace with:
```jsx
      <SectionHeader title="Residential Units" action={isAdmin && !adding && (
```

- [ ] **Step 2: Rename Parking section header**

Find at line 1082:
```jsx
      <SectionHeader title="Parking Floor Schedule (M4 / M5)" action={isAdmin && !adding && (
```

Replace with:
```jsx
      <SectionHeader title="Parking Units" action={isAdmin && !adding && (
```

- [ ] **Step 3: Rename "Slots" column header to "Spaces"**

Find at line 1095:
```jsx
                <th className="text-left px-3 py-2 font-semibold text-gray-400 uppercase tracking-wider" style={{ minWidth: 64 }}>Slots</th>
```

Replace with:
```jsx
                <th className="text-left px-3 py-2 font-semibold text-gray-400 uppercase tracking-wider" style={{ minWidth: 64 }}>Spaces</th>
```

---

## Task 3: Tower Summary Strip

**Files:**
- Modify: `src/components/ProjectDetailModal.jsx:891` (`ProjectFloorSchedule` — add callback)
- Modify: `src/components/ProjectDetailModal.jsx:1033` (`ParkingFloorSchedule` — add callback)
- Modify: `src/components/ProjectDetailModal.jsx:1330` (`CondominiumDevelopmentTab` — add state + strip)

### 3a — Add `onSummaryChange` to `ProjectFloorSchedule`

- [ ] **Step 1: Update function signature**

Find at line 891:
```jsx
function ProjectFloorSchedule({ projectId, buildingId, isAdmin, showToast, refreshKey = 0 }) {
```

Replace with:
```jsx
function ProjectFloorSchedule({ projectId, buildingId, isAdmin, showToast, refreshKey = 0, onSummaryChange }) {
```

- [ ] **Step 2: Call `onSummaryChange` after data loads**

Find the `load` function in `ProjectFloorSchedule` (lines 900–912). After the `setRows(data)` call:

Old code:
```jsx
    if (data) {
      data.sort((a, b) => {
        const na = parseFloat(a.physical_level), nb = parseFloat(b.physical_level)
        if (!isNaN(na) && !isNaN(nb)) return na - nb
        return a.physical_level.localeCompare(b.physical_level)
      })
      setRows(data)
    }
```

New code:
```jsx
    if (data) {
      data.sort((a, b) => {
        const na = parseFloat(a.physical_level), nb = parseFloat(b.physical_level)
        if (!isNaN(na) && !isNaN(nb)) return na - nb
        return a.physical_level.localeCompare(b.physical_level)
      })
      setRows(data)
      onSummaryChange?.({ floors: data.length, units: data.reduce((s, r) => s + (r.num_units ?? 0), 0) })
    }
```

### 3b — Add `onSummaryChange` to `ParkingFloorSchedule`

- [ ] **Step 3: Update function signature**

Find at line 1033:
```jsx
function ParkingFloorSchedule({ projectId, buildingId, isAdmin, showToast, refreshKey = 0 }) {
```

Replace with:
```jsx
function ParkingFloorSchedule({ projectId, buildingId, isAdmin, showToast, refreshKey = 0, onSummaryChange }) {
```

- [ ] **Step 4: Call `onSummaryChange` after data loads**

Find the `load` function in `ParkingFloorSchedule` (lines 1042–1054). After `setRows(data)`:

Old code:
```jsx
    if (data) {
      data.sort((a, b) => {
        const na = parseFloat(a.physical_level), nb = parseFloat(b.physical_level)
        if (!isNaN(na) && !isNaN(nb)) return na - nb
        return a.physical_level.localeCompare(b.physical_level)
      })
      setRows(data)
    }
```

New code:
```jsx
    if (data) {
      data.sort((a, b) => {
        const na = parseFloat(a.physical_level), nb = parseFloat(b.physical_level)
        if (!isNaN(na) && !isNaN(nb)) return na - nb
        return a.physical_level.localeCompare(b.physical_level)
      })
      setRows(data)
      onSummaryChange?.({ floors: data.length, units: data.reduce((s, r) => s + (r.num_units ?? 0), 0) })
    }
```

### 3c — Add summary state and strip to `CondominiumDevelopmentTab`

- [ ] **Step 5: Add summary state**

Find at line 1330:
```jsx
function CondominiumDevelopmentTab({ project, isAdmin, showToast, devRefreshKey = 0, typeBadge, onExport, onImport, importing, importErrors = [], onDismissImportErrors }) {
  const [floorRefreshKey, setFloorRefreshKey] = useState(0)
  const [buildingId, setBuildingId]           = useState(null)
```

Replace with:
```jsx
function CondominiumDevelopmentTab({ project, isAdmin, showToast, devRefreshKey = 0, typeBadge, onExport, onImport, importing, importErrors = [], onDismissImportErrors }) {
  const [floorRefreshKey, setFloorRefreshKey]     = useState(0)
  const [buildingId, setBuildingId]               = useState(null)
  const [resSummary, setResSummary]               = useState({ floors: 0, units: 0 })
  const [parkSummary, setParkSummary]             = useState({ floors: 0, units: 0 })
```

- [ ] **Step 6: Wire `onSummaryChange` props and add summary strip**

Find the `return` block in `CondominiumDevelopmentTab` (lines 1334–1355):

```jsx
  return (
    <div>
      <div className="sticky top-0 z-30 bg-white">
        <ImportErrorPanel errors={importErrors} onDismiss={onDismissImportErrors} />
        <div className="py-3 flex items-center justify-between gap-2 flex-wrap">
          {typeBadge}
          <ExcelButtons onExport={onExport} onImport={onImport} importing={importing} />
        </div>
      </div>

      <BuildingSelector
        projectId={project.id}
        isAdmin={isAdmin}
        buildingId={buildingId}
        onChange={setBuildingId}
      />

      <ProjectFloorSchedule projectId={project.id} buildingId={buildingId} isAdmin={isAdmin} showToast={showToast} refreshKey={Math.max(floorRefreshKey, devRefreshKey)} />
      <ParkingFloorSchedule projectId={project.id} buildingId={buildingId} isAdmin={isAdmin} showToast={showToast} refreshKey={devRefreshKey} />
    </div>
  )
```

Replace with:
```jsx
  return (
    <div>
      <div className="sticky top-0 z-30 bg-white">
        <ImportErrorPanel errors={importErrors} onDismiss={onDismissImportErrors} />
        <div className="py-3 flex items-center justify-between gap-2 flex-wrap">
          {typeBadge}
          <ExcelButtons onExport={onExport} onImport={onImport} importing={importing} />
        </div>
      </div>

      <BuildingSelector
        projectId={project.id}
        isAdmin={isAdmin}
        buildingId={buildingId}
        onChange={id => { setBuildingId(id); setResSummary({ floors: 0, units: 0 }); setParkSummary({ floors: 0, units: 0 }) }}
      />

      {buildingId && (resSummary.floors > 0 || parkSummary.floors > 0) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 mb-4 px-1 text-xs text-gray-500">
          <span>
            <span className="font-semibold text-gray-700">{resSummary.floors}</span>
            {' '}floor{resSummary.floors !== 1 ? 's' : ''} ·{' '}
            <span className="font-semibold text-gray-700">{resSummary.units}</span>
            {' '}units <span className="text-gray-400">(Residential)</span>
          </span>
          <span>
            <span className="font-semibold text-gray-700">{parkSummary.floors}</span>
            {' '}floor{parkSummary.floors !== 1 ? 's' : ''} ·{' '}
            <span className="font-semibold text-gray-700">{parkSummary.units}</span>
            {' '}spaces <span className="text-gray-400">(Parking)</span>
          </span>
        </div>
      )}

      <ProjectFloorSchedule projectId={project.id} buildingId={buildingId} isAdmin={isAdmin} showToast={showToast} refreshKey={Math.max(floorRefreshKey, devRefreshKey)} onSummaryChange={setResSummary} />
      <ParkingFloorSchedule projectId={project.id} buildingId={buildingId} isAdmin={isAdmin} showToast={showToast} refreshKey={devRefreshKey} onSummaryChange={setParkSummary} />
    </div>
  )
```

---

## Task 4: Improve `BulkAddFloorsModal`

**Files:**
- Modify: `src/components/ProjectDetailModal.jsx:828–888`

The current modal has: from/to floor range, level prefix, units/floor. We add: optional M4 start/end dates, optional M5 start/end dates, and a live preview line.

- [ ] **Step 1: Replace the entire `BulkAddFloorsModal` function**

Find the entire function (lines 828–889):
```jsx
function BulkAddFloorsModal({ onConfirm, onCancel, unitLabel = 'Units' }) {
  const [from, setFrom]     = useState('')
  const [to, setTo]         = useState('')
  const [prefix, setPrefix] = useState('')
  const [numUnits, setNumUnits] = useState('')
  const [err, setErr]       = useState('')

  const handle = () => {
    const f = parseInt(from), t = parseInt(to)
    if (isNaN(f) || isNaN(t) || f > t) { setErr('Enter a valid floor range (From ≤ To).'); return }
    if (t - f > 99) { setErr('Maximum 100 floors at a time.'); return }
    setErr('')
    const floors = []
    for (let i = f; i <= t; i++) {
      floors.push({
        physical_level: prefix ? `${prefix}${i}` : String(i),
        marketing_level: null,
        num_units: numUnits !== '' ? parseInt(numUnits) || null : null,
        m4_planned_start: null,
        m4_planned_end:   null,
        m5_planned_start: null,
        m5_planned_end:   null,
      })
    }
    onConfirm(floors)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Bulk Add Floors</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From Floor #</label>
              <input type="number" value={from} onChange={e => setFrom(e.target.value)} placeholder="1" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To Floor #</label>
              <input type="number" value={to} onChange={e => setTo(e.target.value)} placeholder="40" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Level Prefix <span className="font-normal text-gray-400">(optional)</span></label>
              <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="e.g. F or L" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{unitLabel} / Floor <span className="font-normal text-gray-400">(optional)</span></label>
              <input type="number" value={numUnits} onChange={e => setNumUnits(e.target.value)} placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40" />
            </div>
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
          <button onClick={handle} className="px-4 py-2 text-sm font-semibold bg-[#ed6055] hover:bg-[#d94f45] text-white rounded-lg transition">Add Floors</button>
        </div>
      </div>
    </div>
  )
}
```

Replace with the improved version:
```jsx
function BulkAddFloorsModal({ onConfirm, onCancel, unitLabel = 'Units' }) {
  const [from, setFrom]           = useState('')
  const [to, setTo]               = useState('')
  const [prefix, setPrefix]       = useState('')
  const [numUnits, setNumUnits]   = useState('')
  const [m4Start, setM4Start]     = useState('')
  const [m4End, setM4End]         = useState('')
  const [m5Start, setM5Start]     = useState('')
  const [m5End, setM5End]         = useState('')
  const [err, setErr]             = useState('')

  const fieldCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  const f = parseInt(from), t = parseInt(to)
  const rangeValid = !isNaN(f) && !isNaN(t) && f <= t && (t - f) <= 99
  const count = rangeValid ? t - f + 1 : 0

  const previewLabels = () => {
    if (!rangeValid) return ''
    const labels = Array.from({ length: count }, (_, i) => prefix ? `${prefix}${f + i}` : String(f + i))
    if (labels.length <= 4) return labels.join(', ')
    return `${labels[0]}, ${labels[1]} … ${labels[labels.length - 1]}`
  }

  const handle = () => {
    if (!rangeValid) { setErr(isNaN(f) || isNaN(t) ? 'Enter a valid floor range.' : f > t ? 'From must be ≤ To.' : 'Maximum 100 floors at a time.'); return }
    if (m4Start && m4End && m4End < m4Start) { setErr('M4 End Date cannot be before M4 Start Date.'); return }
    if (m5Start && m5End && m5End < m5Start) { setErr('M5 End Date cannot be before M5 Start Date.'); return }
    setErr('')
    const floors = []
    for (let i = f; i <= t; i++) {
      floors.push({
        physical_level:   prefix ? `${prefix}${i}` : String(i),
        marketing_level:  null,
        num_units:        numUnits !== '' ? parseInt(numUnits) || null : null,
        m4_planned_start: m4Start || null,
        m4_planned_end:   m4End   || null,
        m5_planned_start: m5Start || null,
        m5_planned_end:   m5End   || null,
      })
    }
    onConfirm(floors)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Bulk Add Floors</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>From Floor #</label>
              <input type="number" value={from} onChange={e => setFrom(e.target.value)} placeholder="1" className={fieldCls} />
            </div>
            <div>
              <label className={labelCls}>To Floor #</label>
              <input type="number" value={to} onChange={e => setTo(e.target.value)} placeholder="40" className={fieldCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Level Prefix <span className="font-normal text-gray-400">(optional)</span></label>
              <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="e.g. F or L" className={fieldCls} />
            </div>
            <div>
              <label className={labelCls}>{unitLabel} / Floor <span className="font-normal text-gray-400">(optional)</span></label>
              <input type="number" value={numUnits} onChange={e => setNumUnits(e.target.value)} placeholder="0" className={fieldCls} />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-amber-600 mb-1.5">M4 Planned Dates <span className="font-normal text-gray-400">(optional — applied to all floors)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Start Date</label>
                <input type="date" value={m4Start} onChange={e => setM4Start(e.target.value)} className={fieldCls} />
              </div>
              <div>
                <label className={labelCls}>End Date</label>
                <input type="date" value={m4End} onChange={e => setM4End(e.target.value)} className={fieldCls} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-green-600 mb-1.5">M5 Planned Dates <span className="font-normal text-gray-400">(optional — applied to all floors)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Start Date</label>
                <input type="date" value={m5Start} onChange={e => setM5Start(e.target.value)} className={fieldCls} />
              </div>
              <div>
                <label className={labelCls}>End Date</label>
                <input type="date" value={m5End} onChange={e => setM5End(e.target.value)} className={fieldCls} />
              </div>
            </div>
          </div>

          {rangeValid && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
              Will generate <span className="font-semibold text-gray-700">{count}</span> floor{count !== 1 ? 's' : ''}:{' '}
              <span className="font-medium text-gray-600">{previewLabels()}</span>
              {numUnits !== '' && parseInt(numUnits) > 0 && (
                <> — <span className="font-semibold text-gray-700">{numUnits}</span> {unitLabel.toLowerCase()} each</>
              )}
            </p>
          )}

          {err && <p className="text-xs text-red-500">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
          <button onClick={handle} className="px-4 py-2 text-sm font-semibold bg-[#ed6055] hover:bg-[#d94f45] text-white rounded-lg transition">Add Floors</button>
        </div>
      </div>
    </div>
  )
}
```

---

## Self-Review

**Spec coverage check:**
- ✅ "Add Tower/Location" label — Task 1
- ✅ "Residential Units" section header — Task 2
- ✅ "Parking Units" section header — Task 2
- ✅ "Spaces" column label (was "Slots") — Task 2
- ✅ Summary strip per tower — Task 3
- ✅ `onSummaryChange` callbacks in both floor components — Task 3a/3b
- ✅ Summary strip in `CondominiumDevelopmentTab` — Task 3c
- ✅ Bulk add M4/M5 date ranges — Task 4
- ✅ Live preview line — Task 4

**Type consistency check:**
- `onSummaryChange` receives `{ floors: number, units: number }` in both Task 3a and 3b, and is consumed as `setResSummary` / `setParkSummary` (both `useState<{ floors: number, units: number }>`) in Task 3c — consistent.
- `BulkAddFloorsModal` `onConfirm` receives the same floor object shape as before, with `m4_planned_start`, `m4_planned_end`, `m5_planned_start`, `m5_planned_end` now potentially non-null — compatible with both `bulkSave` handlers which pass these straight to Supabase.

**Placeholder scan:** No TBDs, no vague steps, all code included.

**Scope check:** All changes are within a single file, well-bounded, no new abstractions needed.
