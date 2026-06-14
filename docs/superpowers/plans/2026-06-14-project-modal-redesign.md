# Project Detail Modal — Navigation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the white modal header and Overview tab with a dark gradient hero header containing all project details, reduce tabs from 6 to 5, and add live count badges on Permits, Milestones, and Issues tabs.

**Architecture:** All changes are confined to `src/components/ProjectDetailModal.jsx`. The existing `OverviewTab` component is retired — its read view moves into a new dark hero header section, and its edit logic is absorbed into the main modal as `heroEditing` state. Three parallel COUNT queries run on modal open to populate tab count badges. The tab bar moves inside the hero div so tabs sit flush at the bottom of the dark header.

**Tech Stack:** React 19, Tailwind CSS, Supabase JS client (`@supabase/supabase-js`)

---

### Task 1: Add `tabCounts` state and parallel COUNT queries

**Files:**
- Modify: `src/components/ProjectDetailModal.jsx` (main `ProjectDetailModal` function, lines 3815–3838)

- [ ] **Step 1: Add `tabCounts` state**

Inside `ProjectDetailModal`, after line 3818 (`const [toast, setToast] = useState(null)`), add:

```jsx
const [tabCounts, setTabCounts] = useState({ permits: null, milestones: null, issues: null })
```

- [ ] **Step 2: Add `loadCounts` effect**

After the existing `useEffect` for body overflow (lines 3820–3824), add:

```jsx
useEffect(() => {
  const pid = project.id
  Promise.all([
    supabase.from('project_permits').select('*', { count: 'exact', head: true }).eq('project_id', pid),
    supabase.from('milestone_baselines').select('*', { count: 'exact', head: true }).eq('project_id', pid),
    supabase.from('issues').select('*', { count: 'exact', head: true }).eq('project_id', pid).eq('status', 'open'),
  ]).then(([permits, milestones, issues]) => {
    setTabCounts({
      permits:    permits.count    ?? 0,
      milestones: milestones.count ?? 0,
      issues:     issues.count     ?? 0,
    })
  })
}, [project.id])
```

- [ ] **Step 3: Verify in browser**

Open any project modal. In DevTools → Network tab, filter by Fetch/XHR. Three HEAD requests to your Supabase project URL should fire immediately — one each for `project_permits`, `milestone_baselines`, and `issues`. Check the `count` in the response headers (`Content-Range: 0-0/N`).

- [ ] **Step 4: Commit**

```bash
git add src/components/ProjectDetailModal.jsx
git commit -m "feat: load live tab counts on modal open"
```

---

### Task 2: Add hero edit state + helpers above the main modal

**Files:**
- Modify: `src/components/ProjectDetailModal.jsx` (just above the `ProjectDetailModal` export, around line 3813)

- [ ] **Step 1: Add `buildHeroForm` helper**

Just above the line `export default function ProjectDetailModal(` (line 3815), insert:

```jsx
function buildHeroForm(p) {
  return {
    name:             p.name             ?? '',
    project_code:     p.project_code     ?? '',
    is_4ph_project:   p.is_4ph_project   ?? false,
    business_unit:    p.business_unit    ?? '',
    province:         p.province         ?? '',
    city:             p.city             ?? '',
    lot_area:         p.lot_area         ?? '',
    developable_area: p.developable_area ?? '',
    development_type: p.development_type ?? '',
    phase:            p.phase            ?? '',
  }
}
```

- [ ] **Step 2: Add hero state inside `ProjectDetailModal`**

Inside `ProjectDetailModal`, after the `tabCounts` state line (added in Task 1), add:

```jsx
const [heroEditing, setHeroEditing] = useState(startEditing)
const [heroForm,    setHeroForm]    = useState(() => startEditing ? buildHeroForm(initialProject) : {})
const [heroSaving,  setHeroSaving]  = useState(false)
```

- [ ] **Step 3: Add `saveHero` function**

Inside `ProjectDetailModal`, after the `handleUpdated` function (lines 3834–3838), add:

```jsx
const saveHero = async () => {
  setHeroSaving(true)
  const payload = {
    name:             heroForm.name.trim(),
    project_code:     heroForm.project_code.trim() || null,
    is_4ph_project:   heroForm.is_4ph_project,
    business_unit:    heroForm.business_unit     || null,
    province:         heroForm.province          || null,
    city:             heroForm.city              || null,
    lot_area:         heroForm.lot_area         !== '' ? parseFloat(heroForm.lot_area)         : null,
    developable_area: heroForm.developable_area !== '' ? parseFloat(heroForm.developable_area) : null,
    development_type: heroForm.development_type  || null,
    phase:            heroForm.phase             || null,
  }
  if (noNeg(payload.lot_area, payload.developable_area)) {
    showToast('Values cannot be negative.', 'error')
    setHeroSaving(false)
    return
  }
  const { error } = await supabase.from('projects').update(payload).eq('id', project.id)
  setHeroSaving(false)
  if (error) { showToast('Failed to save: ' + error.message, 'error'); return }
  showToast('Project updated.', 'success')
  setHeroEditing(false)
  handleUpdated(payload)
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ProjectDetailModal.jsx
git commit -m "feat: add hero edit state, buildHeroForm helper, and saveHero"
```

---

### Task 3: Replace the white header + tabs with the dark hero

**Files:**
- Modify: `src/components/ProjectDetailModal.jsx` (modal return JSX, lines 3840–3882)

This task replaces two sibling divs — the white header and the tab bar — with a single dark hero div that contains both.

- [ ] **Step 1: Remove the `style` borderTop from the outer modal div**

Find (line ~3843):

```jsx
<div className="bg-white rounded-none sm:rounded-2xl shadow-2xl w-full sm:max-w-7xl h-full sm:max-h-[92vh] flex flex-col overflow-hidden"
  style={{ borderTop: `4px solid ${phase?.color ?? '#ed6055'}` }}>
```

Remove the `style` prop — result:

```jsx
<div className="bg-white rounded-none sm:rounded-2xl shadow-2xl w-full sm:max-w-7xl h-full sm:max-h-[92vh] flex flex-col overflow-hidden">
```

- [ ] **Step 2: Replace the white header block AND the old tabs block with the dark hero**

The two blocks to replace are:

```jsx
{/* Modal header */}
<div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between gap-4 flex-shrink-0">
  ...
</div>

{/* Tabs */}
<div className="flex border-b border-gray-100 flex-shrink-0 overflow-x-auto bg-gray-50/50 scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
  ...
</div>
```

Replace both with this single block:

```jsx
{/* Dark hero header — contains project details + tabs */}
<div className="flex-shrink-0 border-b border-gray-100"
  style={{ background: 'linear-gradient(135deg, #1e293b 0%, #2d3f55 100%)' }}>

  {!heroEditing ? (
    /* ── Read mode ── */
    <div className="px-6 pt-5">
      {/* Top row: name + actions */}
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap mb-1">
            <h2 className="text-xl font-bold text-white leading-tight">{project.name}</h2>
            {project.is_4ph_project && (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.25)', color: 'white' }}>
                4PH
              </span>
            )}
            {phase && (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex-shrink-0"
                style={{ background: 'rgba(237,96,85,0.25)', borderColor: 'rgba(237,96,85,0.35)', color: '#fca5a5' }}>
                {phase.label}
              </span>
            )}
          </div>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {[
              project.development_type === 'housing' ? 'Housing' : project.development_type === 'condominium' ? 'Condominium' : null,
              project.city,
              project.province,
            ].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
          {isAdmin && (
            <button
              onClick={() => { setHeroForm(buildHeroForm(project)); setHeroEditing(true) }}
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-all"
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}
              title="Edit project details"
              aria-label="Edit project details"
            >
              <PencilIcon />
            </button>
          )}
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}
            aria-label="Close"
          >
            <XIcon />
          </button>
        </div>
      </div>

      {/* Fields grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 py-4 mt-2"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Project Code</p>
          <p className="text-sm font-bold text-white">{project.project_code || '—'}</p>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>4PH Project</p>
          {project.is_4ph_project
            ? <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border"
                style={{ background: 'rgba(34,197,94,0.2)', borderColor: 'rgba(34,197,94,0.3)', color: '#86efac' }}>
                ✓ Yes
              </span>
            : <p className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>No</p>
          }
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Business Unit</p>
          <p className="text-sm font-bold text-white">{project.business_unit || '—'}</p>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Dev Type</p>
          <p className="text-sm font-bold text-white capitalize">{project.development_type || '—'}</p>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Province</p>
          <p className="text-sm font-bold text-white">{project.province || '—'}</p>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>City / Municipality</p>
          <p className="text-sm font-bold text-white">{project.city || '—'}</p>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Project Lot Area</p>
          <p className="text-sm font-bold text-white">
            {project.lot_area != null ? `${Number(project.lot_area).toLocaleString()} sqm` : '—'}
          </p>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Dev Area</p>
          <p className="text-sm font-bold text-white">
            {project.developable_area != null ? `${Number(project.developable_area).toLocaleString()} sqm` : '—'}
          </p>
        </div>
      </div>
    </div>
  ) : (
    /* ── Edit mode ── */
    <div className="px-6 pt-5 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-white">Edit Project Details</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setHeroEditing(false)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)' }}
          >
            Cancel
          </button>
          <button
            onClick={saveHero}
            disabled={heroSaving || !heroForm.name?.trim()}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#ed6055] text-white hover:bg-[#d94f45] disabled:opacity-50 transition"
          >
            {heroSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Project Name *</p>
          <input
            value={heroForm.name}
            onChange={e => setHeroForm(f => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
            placeholder="Project name"
          />
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Project Code</p>
          <input
            value={heroForm.project_code}
            onChange={e => setHeroForm(f => ({ ...f, project_code: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
            placeholder="e.g. PRJ-001"
          />
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Business Unit</p>
          <select
            value={heroForm.business_unit}
            onChange={e => setHeroForm(f => ({ ...f, business_unit: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/30"
            style={{ background: 'rgba(30,41,59,0.9)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <option value="" className="text-black bg-white">— Select —</option>
            {BUSINESS_UNITS.map(u => <option key={u.code} value={u.code} className="text-black bg-white">{u.code}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Development Type</p>
          <select
            value={heroForm.development_type}
            onChange={e => setHeroForm(f => ({ ...f, development_type: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/30"
            style={{ background: 'rgba(30,41,59,0.9)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <option value="" className="text-black bg-white">— Select —</option>
            <option value="housing" className="text-black bg-white">Housing</option>
            <option value="condominium" className="text-black bg-white">Condominium</option>
          </select>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Province</p>
          <Combobox
            options={PH_PROVINCES}
            value={heroForm.province}
            onChange={v => setHeroForm(f => ({ ...f, province: v, city: '' }))}
            placeholder="Type to search province…"
          />
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>City / Municipality</p>
          <Combobox
            options={PH_CITIES[heroForm.province] ?? []}
            value={heroForm.city}
            onChange={v => setHeroForm(f => ({ ...f, city: v }))}
            placeholder="Type to search city…"
            disabled={!heroForm.province}
          />
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Project Lot Area (sqm)</p>
          <input
            type="number" min="0"
            value={heroForm.lot_area}
            onChange={e => setHeroForm(f => ({ ...f, lot_area: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
            placeholder="0"
          />
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Dev Area (sqm)</p>
          <input
            type="number" min="0"
            value={heroForm.developable_area}
            onChange={e => setHeroForm(f => ({ ...f, developable_area: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
            placeholder="0"
          />
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Phase</p>
          <select
            value={heroForm.phase}
            onChange={e => setHeroForm(f => ({ ...f, phase: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/30"
            style={{ background: 'rgba(30,41,59,0.9)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <option value="" className="text-black bg-white">— Select —</option>
            {PHASES.map(p => <option key={p.key} value={p.key} className="text-black bg-white">{p.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 sm:col-span-2 pt-1">
          <input
            type="checkbox" id="hero_4ph"
            checked={heroForm.is_4ph_project}
            onChange={e => setHeroForm(f => ({ ...f, is_4ph_project: e.target.checked }))}
            className="accent-[#ed6055] w-4 h-4"
          />
          <label htmlFor="hero_4ph" className="text-sm cursor-pointer select-none" style={{ color: 'rgba(255,255,255,0.8)' }}>
            4PH Project
          </label>
        </div>
      </div>
    </div>
  )}

  {/* Tab bar — sits at bottom of dark hero */}
  <div className="flex overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
    {tabs.map(t => {
      const count =
        t === 'Permits'           ? tabCounts.permits    :
        t === 'Milestones'        ? tabCounts.milestones :
        t === 'Issues & Concerns' ? tabCounts.issues     :
        null
      const isAlert = t === 'Issues & Concerns' && tabCounts.issues > 0
      return (
        <button
          key={t}
          onClick={() => setTab(t)}
          className="flex items-center gap-1.5 px-5 py-3 text-sm font-semibold whitespace-nowrap transition-all border-b-2 -mb-px"
          style={{
            color:        tab === t ? 'white' : 'rgba(255,255,255,0.45)',
            borderBottomColor: tab === t ? '#ed6055' : 'transparent',
          }}
        >
          {t}
          {count != null && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={isAlert
                ? { background: 'rgba(237,96,85,0.35)', color: '#fca5a5' }
                : { background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }
              }
            >
              {count}
            </span>
          )}
        </button>
      )
    })}
  </div>
</div>
```

- [ ] **Step 3: Verify in browser**

Open any project modal. You should see:
- Dark gradient header with project name, 4PH badge, phase pill top-left
- ✎ icon + ✕ icon top-right (✎ only visible when `isAdmin` is true)
- 8 project detail fields in a 2-col (mobile) / 4-col (desktop) grid
- "4PH: Yes" in a green badge, "No" in muted white
- Tab bar at the bottom of the dark header: Development | Permits (N) | Milestones (N) | Issues (N) | Completion (M4/M5)
- Count badges appear once queries resolve (~1s)
- Issues badge is coral/red when count > 0

- [ ] **Step 4: Verify edit mode**

Click ✎. The hero should switch to the edit form — all 10 fields visible, dark-styled inputs, Save + Cancel buttons. Enter values and click Save — hero returns to read mode showing updated values. Click ✎ again, make changes, click Cancel — values unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProjectDetailModal.jsx
git commit -m "feat: dark hero header with read/edit modes and tab bar"
```

---

### Task 4: Update `BASE_TABS`, default tab, and retire `OverviewTab`

**Files:**
- Modify: `src/components/ProjectDetailModal.jsx` (lines 42, 3815, 3885–3892)

- [ ] **Step 1: Update `BASE_TABS` constant (line 42)**

Change:
```jsx
const BASE_TABS = ['Overview', 'Development', 'Permits', 'Milestones', 'Issues & Concerns']
```

To:
```jsx
const BASE_TABS = ['Development', 'Permits', 'Milestones', 'Issues & Concerns']
```

- [ ] **Step 2: Update default `startTab` in the modal props (line 3815)**

Change:
```jsx
export default function ProjectDetailModal({ project: initialProject, isAdmin, onClose, onProjectUpdated, startEditing = false, startTab = 'Overview' }) {
```

To:
```jsx
export default function ProjectDetailModal({ project: initialProject, isAdmin, onClose, onProjectUpdated, startEditing = false, startTab = 'Development' }) {
```

- [ ] **Step 3: Remove the Overview line from tab content (line ~3886)**

Find and delete:
```jsx
{tab === 'Overview'          && <OverviewTab    project={project} isAdmin={isAdmin} onUpdated={handleUpdated} showToast={showToast} startEditing={startEditing} />}
```

- [ ] **Step 4: Remove the conditional padding on the tab content div (line ~3885)**

Change:
```jsx
<div className={`flex-1 overflow-y-auto px-3 sm:px-6 ${tab === 'Overview' ? 'py-4 sm:py-5' : 'pb-4 sm:pb-5'}`}>
```

To:
```jsx
<div className="flex-1 overflow-y-auto px-3 sm:px-6 pb-4 sm:pb-5">
```

- [ ] **Step 5: Verify in browser**

- Open any project modal — it should open on the Development tab, never Overview
- All 5 tabs function correctly with no blank content areas
- No console errors
- `startEditing` prop from `ProjectsPage` opens the hero in edit mode (verify by triggering the edit flow from the projects list)

- [ ] **Step 6: Commit**

```bash
git add src/components/ProjectDetailModal.jsx
git commit -m "feat: retire Overview tab, details now permanently in hero header"
```
