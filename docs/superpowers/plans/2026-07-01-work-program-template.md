# Work Program Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a global standard work program template (stored in Supabase) that admins can edit in Settings, and that pre-populates any new baseline with one click.

**Architecture:** New DB table `work_program_template_tasks` stores the template. A new admin page at `/admin/work-program-template` provides inline editing. The existing "New Baseline" modal gains a Yes/No prompt; on Yes, a `copyTemplateToBaseline()` function inserts template tasks as `project_milestones` and resolves predecessor text into `milestone_dependencies`.

**Tech Stack:** React 19, Supabase JS v2, Tailwind CSS, React Router v6. No new dependencies.

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260701100000_work_program_template.sql` | Create | Table DDL + RLS |
| `supabase/migrations/20260701100001_work_program_template_seed.sql` | Create | Seed with Jab Residences task names |
| `src/lib/templateUtils.js` | Create | `copyTemplateToBaseline()`, `parseTemplatePredecessors()`, `assignSeqNumbers()` |
| `src/pages/admin/WorkProgramTemplate.jsx` | Create | Settings page — template editor UI |
| `src/App.jsx` | Modify | Add `/admin/work-program-template` route |
| `src/components/GanttModal.jsx` | Modify | Add Yes/No prompt to New Baseline modal; call `copyTemplateToBaseline` on Yes |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260701100000_work_program_template.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260701100000_work_program_template.sql
CREATE TABLE IF NOT EXISTS work_program_template_tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order     integer NOT NULL,
  phase          text NOT NULL CHECK (phase IN ('initiation','planning','execution_monitoring','closeout')),
  milestone_name text NOT NULL,
  parent_id      uuid REFERENCES work_program_template_tasks(id) ON DELETE CASCADE,
  duration       integer CHECK (duration IS NULL OR duration > 0),
  predecessor_text text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE work_program_template_tasks ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (needed when copying to baseline)
CREATE POLICY "template_tasks_read" ON work_program_template_tasks
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only admins can write
CREATE POLICY "template_tasks_admin_write" ON work_program_template_tasks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
```

> **Note:** Check the existing RLS pattern in another migration to confirm the admin check table name (`user_roles`) and column names. Adjust if different.

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with the SQL above. Confirm the table appears in `list_tables`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260701100000_work_program_template.sql
git commit -m "feat: add work_program_template_tasks table"
```

---

## Task 2: Seed Template with Jab Residences Tasks

**Files:**
- Create: `supabase/migrations/20260701100001_work_program_template_seed.sql`

**Context:** The Jab Residences project already has milestones in `project_milestones`. We seed the template by copying its task names and hierarchy. Durations and predecessor_text start NULL (admins fill them in via the editor). Find Jab Residences' `project_id` by querying `SELECT id FROM projects WHERE name ILIKE '%Jab%' LIMIT 1`, then find its baseline with `SELECT id FROM milestone_baselines WHERE project_id = '<id>' ORDER BY created_at LIMIT 1`.

- [ ] **Step 1: Query Jab Residences milestones**

Run this SQL via Supabase MCP to get the task tree:

```sql
SELECT
  m.id,
  m.milestone_name,
  m.phase,
  m.parent_id,
  m.sort_order
FROM project_milestones m
JOIN milestone_baselines b ON b.id = m.baseline_id
JOIN projects p ON p.id = b.project_id
WHERE p.name ILIKE '%Jab%'
ORDER BY m.sort_order;
```

- [ ] **Step 2: Write the seed migration**

Use the query results to build INSERT statements. The structure maps `phase`, `milestone_name`, `sort_order` directly. For `parent_id`: parent tasks get NULL; child tasks reference their parent's new UUID via a CTE or sequential inserts. Use explicit UUIDs for cross-referencing parents:

```sql
-- supabase/migrations/20260701100001_work_program_template_seed.sql
-- Seed from Jab Residences work program. Durations and predecessors filled in by admin.

INSERT INTO work_program_template_tasks (id, sort_order, phase, milestone_name, parent_id, duration, predecessor_text)
VALUES
  -- INITIATION phase — parent tasks first
  ('00000001-0000-0000-0000-000000000001', 1,  'initiation', 'Prepare Preliminary Technical Due Diligence', NULL, NULL, NULL),
  -- children of task 1
  ('00000001-0000-0000-0000-000000000002', 2,  'initiation', 'Relocation Assessment',                       '00000001-0000-0000-0000-000000000001', NULL, NULL),
  ('00000001-0000-0000-0000-000000000003', 3,  'initiation', 'Topographic Assessment',                      '00000001-0000-0000-0000-000000000001', NULL, NULL),
  ('00000001-0000-0000-0000-000000000004', 4,  'initiation', 'Hydrological Assessment',                     '00000001-0000-0000-0000-000000000001', NULL, NULL),
  ('00000001-0000-0000-0000-000000000005', 5,  'initiation', 'Geotechnical Study',                          '00000001-0000-0000-0000-000000000001', NULL, NULL),
  ('00000001-0000-0000-0000-000000000006', 6,  'initiation', 'Traffic Assessment',                          '00000001-0000-0000-0000-000000000001', NULL, NULL),
  ('00000001-0000-0000-0000-000000000007', 7,  'initiation', 'Building Code Ordinances (per LGU)',           '00000001-0000-0000-0000-000000000001', NULL, NULL),
  -- second parent
  ('00000001-0000-0000-0000-000000000008', 8,  'initiation', 'Secure Land Use Permits and Licenses',        NULL, NULL, NULL),
  ('00000001-0000-0000-0000-000000000009', 9,  'initiation', 'Title Transfer from Landowner to PH1',        '00000001-0000-0000-0000-000000000008', NULL, NULL),
  ('00000001-0000-0000-0000-000000000010', 10, 'initiation', 'Secure Land Tax Declaration Transfer',        '00000001-0000-0000-0000-000000000008', NULL, NULL),
  ('00000001-0000-0000-0000-000000000011', 11, 'initiation', 'Secure Zoning Certificate',                   '00000001-0000-0000-0000-000000000008', NULL, NULL)
  -- Continue with remaining phases from the query results in Step 1
  -- Add all remaining tasks following the same pattern
ON CONFLICT (id) DO NOTHING;
```

> **Important:** Replace the placeholder rows above with ALL tasks from the Step 1 query. The IDs are fixed UUIDs used for cross-referencing parent_id. Increment the last segment for each row (000000000012, 000000000013, etc.).

- [ ] **Step 3: Apply the seed migration via Supabase MCP**

Apply and verify with:
```sql
SELECT count(*) FROM work_program_template_tasks;
-- Should equal the number of milestones in Jab Residences' baseline
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260701100001_work_program_template_seed.sql
git commit -m "feat: seed work program template from Jab Residences"
```

---

## Task 3: Template Utilities

**Files:**
- Create: `src/lib/templateUtils.js`

This file holds three pure/async functions used by both the editor and the baseline copy flow.

- [ ] **Step 1: Write `assignSeqNumbers(tasks)`**

Takes the flat array of template tasks (sorted by sort_order) and returns a Map from task id → seq string (e.g. `"1"`, `"1.1"`, `"2.3"`).

```js
// src/lib/templateUtils.js

/**
 * Assigns seq numbers to template tasks.
 * Top-level tasks: "1", "2", "3"...
 * Children: "1.1", "1.2", "2.1"...
 * @param {Array} tasks - sorted by sort_order, shape { id, parent_id, ... }
 * @returns {Map<string, string>} id → seq string
 */
export function assignSeqNumbers(tasks) {
  const seqMap = new Map()
  let topCount = 0
  const childCountByParent = new Map()

  for (const task of tasks) {
    if (!task.parent_id) {
      topCount++
      seqMap.set(task.id, String(topCount))
    } else {
      const parentSeq = seqMap.get(task.parent_id) ?? '?'
      const prev = childCountByParent.get(task.parent_id) ?? 0
      const childIdx = prev + 1
      childCountByParent.set(task.parent_id, childIdx)
      seqMap.set(task.id, `${parentSeq}.${childIdx}`)
    }
  }
  return seqMap
}
```

- [ ] **Step 2: Write `parseTemplatePredecessors(text, seqToId)`**

Parses predecessor text from the template format (e.g. `"1.1 FS"`, `"2 FS+7"`, `"1.3 SS"`) into structured objects.

```js
/**
 * Parses template predecessor text into dependency objects.
 * Format: "<seq> <type>[+<lag>]" comma-separated. e.g. "1.1 FS, 2 SS+7"
 * @param {string} text
 * @param {Map<string, string>} seqToId - seq string → milestone UUID in the NEW baseline
 * @returns {Array<{fromId: string, type: string, lagDays: number}>} - empty array if no predecessors
 */
export function parseTemplatePredecessors(text, seqToId) {
  if (!text?.trim()) return []
  const tokens = text.split(',').map(s => s.trim()).filter(Boolean)
  const result = []
  for (const token of tokens) {
    const m = token.match(/^([\d.]+)\s*(FS|SS|FF|SF)?(?:\+(\d+))?$/i)
    if (!m) continue  // skip unresolvable tokens silently
    const seq     = m[1]
    const type    = m[2]?.toUpperCase() ?? 'FS'
    const lagDays = m[3] ? parseInt(m[3], 10) : 0
    const fromId  = seqToId.get(seq)
    if (!fromId) continue  // skip if seq not found
    result.push({ fromId, type, lagDays })
  }
  return result
}
```

- [ ] **Step 3: Write `copyTemplateToBaseline(baselineId, supabase)`**

Fetches all template tasks, inserts them as project_milestones, then resolves predecessor_text into milestone_dependencies.

```js
/**
 * Copies all work_program_template_tasks into a new baseline as project_milestones.
 * Also inserts milestone_dependencies by resolving predecessor_text.
 * @param {string} baselineId - the newly created milestone_baselines.id
 * @param {object} supabase - Supabase client
 * @param {string} projectId - the project id (needed for project_milestones.project_id)
 * @returns {Promise<{error: string|null}>}
 */
export async function copyTemplateToBaseline(baselineId, supabase, projectId) {
  // 1. Fetch all template tasks sorted by sort_order
  const { data: tasks, error: fetchErr } = await supabase
    .from('work_program_template_tasks')
    .select('*')
    .order('sort_order')
  if (fetchErr) return { error: fetchErr.message }
  if (!tasks?.length) return { error: null }  // empty template — nothing to copy

  // 2. Assign seq numbers to template tasks (for predecessor resolution)
  const templateSeqMap = assignSeqNumbers(tasks)  // id → seq

  // 3. Insert parent tasks first (parent_id = null), then children
  //    Build templateId → newMilestoneId mapping as we go
  const templateToNewId = new Map()

  const parents  = tasks.filter(t => !t.parent_id)
  const children = tasks.filter(t =>  t.parent_id)

  // Insert parents
  for (const task of parents) {
    const { data, error } = await supabase
      .from('project_milestones')
      .insert({
        project_id:     projectId,
        baseline_id:    baselineId,
        phase:          task.phase,
        milestone_name: task.milestone_name,
        sort_order:     task.sort_order,
        duration:       task.duration,
        parent_id:      null,
      })
      .select('id')
      .single()
    if (error) return { error: error.message }
    templateToNewId.set(task.id, data.id)
  }

  // Insert children (parents already inserted, so parent IDs are known)
  for (const task of children) {
    const newParentId = templateToNewId.get(task.parent_id)
    if (!newParentId) continue  // orphan — skip
    const { data, error } = await supabase
      .from('project_milestones')
      .insert({
        project_id:     projectId,
        baseline_id:    baselineId,
        phase:          task.phase,
        milestone_name: task.milestone_name,
        sort_order:     task.sort_order,
        duration:       task.duration,
        parent_id:      newParentId,
      })
      .select('id')
      .single()
    if (error) return { error: error.message }
    templateToNewId.set(task.id, data.id)
  }

  // 4. Build seqToNewId map for predecessor resolution
  //    seqToNewId: seq string → new milestone UUID
  const seqToNewId = new Map()
  for (const [templateId, seq] of templateSeqMap) {
    const newId = templateToNewId.get(templateId)
    if (newId) seqToNewId.set(seq, newId)
  }

  // 5. Resolve predecessor_text → milestone_dependencies
  const depRows = []
  for (const task of tasks) {
    if (!task.predecessor_text) continue
    const newToId = templateToNewId.get(task.id)
    if (!newToId) continue
    const deps = parseTemplatePredecessors(task.predecessor_text, seqToNewId)
    for (const dep of deps) {
      depRows.push({
        baseline_id: baselineId,
        from_id:     dep.fromId,
        to_id:       newToId,
        type:        dep.type,
        lag_days:    dep.lagDays,
      })
    }
  }

  if (depRows.length) {
    const { error: depErr } = await supabase
      .from('milestone_dependencies')
      .insert(depRows)
    if (depErr) return { error: depErr.message }
  }

  return { error: null }
}
```

- [ ] **Step 4: Verify the file is syntactically correct**

```bash
node --input-type=module < src/lib/templateUtils.js
```

Expected: no output (no errors). If `node` complains about Supabase imports, that's fine — the functions only import each other.

- [ ] **Step 5: Commit**

```bash
git add src/lib/templateUtils.js
git commit -m "feat: add copyTemplateToBaseline and template predecessor parsing"
```

---

## Task 4: Settings Page Scaffold + Template Editor (Read View)

**Files:**
- Create: `src/pages/admin/WorkProgramTemplate.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Add the route to App.jsx**

In `src/App.jsx`, after the existing admin routes (line ~46):

```jsx
import WorkProgramTemplate from './pages/admin/WorkProgramTemplate'
```

And in the Routes:
```jsx
<Route path="/admin/work-program-template" element={<ProtectedRoute roles={['admin']}><WorkProgramTemplate /></ProtectedRoute>} />
```

- [ ] **Step 2: Create the WorkProgramTemplate page skeleton**

```jsx
// src/pages/admin/WorkProgramTemplate.jsx
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'
import DashboardLayout from '../../components/DashboardLayout'
import { assignSeqNumbers } from '../../lib/templateUtils'

const PHASES = [
  { key: 'initiation',           label: 'Initiation' },
  { key: 'planning',             label: 'Planning' },
  { key: 'execution_monitoring', label: 'Execution & Monitoring' },
  { key: 'closeout',             label: 'Close-Out' },
]

export default function WorkProgramTemplate() {
  const [tasks,   setTasks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [toast,   setToast]   = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadTasks = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('work_program_template_tasks')
      .select('*')
      .order('sort_order')
    if (error) showToast(error.message, 'error')
    else setTasks(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadTasks() }, [])

  const seqMap = assignSeqNumbers(tasks)  // id → seq string

  return (
    <DashboardLayout>
      <div className="flex min-h-screen bg-gray-50">

        {/* Left sidebar */}
        <aside className="w-44 shrink-0 bg-white border-r border-gray-200 p-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Settings</p>
          <nav className="space-y-1 text-sm">
            <a href="/admin/roles"            className="block px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50">Users</a>
            <a href="/admin/standard-permits" className="block px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50">Standard Permits</a>
            <span className="block px-3 py-2 rounded-lg bg-red-50 text-[#ed6055] font-semibold">Work Program Template</span>
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6 max-w-4xl">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Standard Work Program</h1>
              <p className="text-xs text-gray-500 mt-0.5">Pre-loaded when creating a new baseline. Hover a row and click + to add tasks.</p>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-400 mt-8 text-center">Loading…</div>
          ) : (
            <TemplateTable
              tasks={tasks}
              seqMap={seqMap}
              onReload={loadTasks}
              showToast={showToast}
            />
          )}
        </main>

        {/* Toast */}
        {toast && (
          <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl text-sm font-medium shadow-lg z-50 ${toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-gray-900 text-white'}`}>
            {toast.msg}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
```

- [ ] **Step 3: Write the TemplateTable component (read view)**

Add this above `WorkProgramTemplate` in the same file:

```jsx
function TemplateTable({ tasks, seqMap, onReload, showToast }) {
  return (
    <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-50 text-left">
            <th className="px-3 py-2.5 text-gray-500 font-semibold w-10">#</th>
            <th className="px-3 py-2.5 text-gray-500 font-semibold">Activity</th>
            <th className="px-3 py-2.5 text-gray-500 font-semibold text-center w-24">Dur. (days)</th>
            <th className="px-3 py-2.5 text-gray-500 font-semibold w-32">Predecessors</th>
            <th className="px-3 py-2.5 w-14"></th>
          </tr>
        </thead>
        <tbody>
          {PHASES.map(phase => {
            const phaseTasks = tasks.filter(t => t.phase === phase.key)
            if (!phaseTasks.length) return (
              <PhaseSection key={phase.key} label={phase.label} isEmpty />
            )
            const parents  = phaseTasks.filter(t => !t.parent_id)
            const childrenOf = (pid) => phaseTasks.filter(t => t.parent_id === pid)
            return (
              <PhaseSection key={phase.key} label={phase.label}>
                {parents.map(parent => (
                  <>
                    <TaskRow
                      key={parent.id}
                      task={parent}
                      seq={seqMap.get(parent.id) ?? '—'}
                      isChild={false}
                      onReload={onReload}
                      showToast={showToast}
                      allTasks={tasks}
                    />
                    {childrenOf(parent.id).map(child => (
                      <TaskRow
                        key={child.id}
                        task={child}
                        seq={seqMap.get(child.id) ?? '—'}
                        isChild={true}
                        onReload={onReload}
                        showToast={showToast}
                        allTasks={tasks}
                      />
                    ))}
                  </>
                ))}
              </PhaseSection>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PhaseSection({ label, children, isEmpty }) {
  return (
    <>
      <tr className="bg-gray-50 border-t-2 border-gray-200">
        <td colSpan={5} className="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
          ▸ {label}
        </td>
      </tr>
      {isEmpty
        ? <tr><td colSpan={5} className="px-3 py-2 text-gray-400 italic text-[11px]">No tasks yet</td></tr>
        : children
      }
    </>
  )
}
```

- [ ] **Step 4: Write the TaskRow component (read-only for now — editing in Task 5)**

```jsx
function TaskRow({ task, seq, isChild, onReload, showToast, allTasks }) {
  const [hovered, setHovered] = useState(false)
  const hasChildren = allTasks.some(t => t.parent_id === task.id)

  return (
    <tr
      className={`border-b border-gray-100 group ${isChild ? 'bg-blue-50/30' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td className="px-3 py-2 text-gray-400">{seq}</td>
      <td className="px-3 py-2" style={{ paddingLeft: isChild ? 28 : 12 }}>
        <div className="flex items-center gap-2">
          <span className={isChild ? 'text-gray-700' : 'font-semibold text-gray-900'}>
            {task.milestone_name}
          </span>
          {/* + button — visible on hover */}
          {hovered && (
            <button
              className="w-4 h-4 rounded-full bg-[#ed6055] text-white text-[11px] font-bold leading-none flex items-center justify-center shrink-0"
              title={isChild ? 'Add sibling task below' : 'Add child task'}
            >
              +
            </button>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-center">
        {hasChildren ? <span className="text-gray-300">—</span> : (task.duration ?? <span className="text-gray-300">—</span>)}
      </td>
      <td className="px-3 py-2 text-gray-600">{task.predecessor_text ?? <span className="text-gray-300">—</span>}</td>
      <td className="px-3 py-2 text-right">
        <span className="text-gray-300 cursor-pointer mr-2 hover:text-gray-500">✎</span>
        <span className="text-red-200 cursor-pointer hover:text-red-400">✕</span>
      </td>
    </tr>
  )
}
```

- [ ] **Step 5: Verify the page renders**

Run `npm run dev` and navigate to `http://localhost:5173/admin/work-program-template`. You should see the Settings sidebar and the template table with all seeded tasks.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/WorkProgramTemplate.jsx src/App.jsx
git commit -m "feat: add Work Program Template settings page with read-only table"
```

---

## Task 5: Template Editor — Inline Add, Edit, Delete

**Files:**
- Modify: `src/pages/admin/WorkProgramTemplate.jsx`

This task wires up the `+` button, the inline row editor, the ✎ edit button, and the ✕ delete button.

- [ ] **Step 1: Add state for inline add/edit to TemplateTable**

Replace the `TemplateTable` function signature to include add/edit state:

```jsx
function TemplateTable({ tasks, seqMap, onReload, showToast }) {
  const [addingAfter, setAddingAfter] = useState(null)
  // addingAfter: { parentId: string|null, phase: string, afterSortOrder: number, isChild: boolean }
  const [editingId, setEditingId]     = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  // confirmDelete: { id: string, name: string, childCount: number }
```

- [ ] **Step 2: Wire + button in TaskRow to open inline row**

Update `TaskRow` to accept `onAddBelow` and `onEdit` and `onDelete` props and call them:

```jsx
function TaskRow({ task, seq, isChild, onReload, showToast, allTasks, onAddBelow, onEdit, onDelete, editingId }) {
  const [hovered, setHovered] = useState(false)
  const isEditing   = editingId === task.id
  const hasChildren = allTasks.some(t => t.parent_id === task.id)

  if (isEditing) {
    return (
      <InlineRow
        initial={{ name: task.milestone_name, duration: task.duration ?? '', preds: task.predecessor_text ?? '' }}
        seq={seq}
        isChild={isChild}
        onSave={async ({ name, duration, preds }) => {
          const { error } = await supabase
            .from('work_program_template_tasks')
            .update({
              milestone_name:   name.trim(),
              duration:         duration ? parseInt(duration, 10) : null,
              predecessor_text: preds.trim() || null,
            })
            .eq('id', task.id)
          if (error) { showToast(error.message, 'error'); return }
          showToast('Task updated.')
          onEdit(null)
          onReload()
        }}
        onCancel={() => onEdit(null)}
      />
    )
  }

  return (
    <tr
      className={`border-b border-gray-100 ${isChild ? 'bg-blue-50/30' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td className="px-3 py-2 text-gray-400">{seq}</td>
      <td className="px-3 py-2" style={{ paddingLeft: isChild ? 28 : 12 }}>
        <div className="flex items-center gap-2">
          <span className={isChild ? 'text-gray-700' : 'font-semibold text-gray-900'}>
            {task.milestone_name}
          </span>
          {hovered && (
            <button
              onClick={() => onAddBelow(task)}
              className="w-4 h-4 rounded-full bg-[#ed6055] text-white text-[11px] font-bold leading-none flex items-center justify-center shrink-0"
              title={isChild ? 'Add sibling below' : 'Add child task'}
            >
              +
            </button>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-center">
        {hasChildren ? <span className="text-gray-300">—</span> : (task.duration != null ? task.duration : <span className="text-gray-300">—</span>)}
      </td>
      <td className="px-3 py-2 text-gray-600">{task.predecessor_text ?? <span className="text-gray-300">—</span>}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <span onClick={() => onEdit(task.id)} className="text-gray-300 cursor-pointer mr-2 hover:text-gray-500">✎</span>
        <span onClick={() => onDelete(task)} className="text-red-200 cursor-pointer hover:text-red-400">✕</span>
      </td>
    </tr>
  )
}
```

- [ ] **Step 3: Write the InlineRow component**

```jsx
function InlineRow({ initial = {}, seq, isChild, onSave, onCancel }) {
  const [name,     setName]     = useState(initial.name     ?? '')
  const [duration, setDuration] = useState(initial.duration ?? '')
  const [preds,    setPreds]    = useState(initial.preds    ?? '')
  const [saving,   setSaving]   = useState(false)
  const nameRef = useRef(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onSave({ name, duration, preds })
    setSaving(false)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter')  handleSave()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <tr className="bg-yellow-50 border-t border-b border-yellow-300">
      <td className="px-3 py-2 text-gray-400">{seq}</td>
      <td className="py-1.5" style={{ paddingLeft: isChild ? 28 : 12, paddingRight: 8 }}>
        <input
          ref={nameRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Activity name…"
          className="w-full border border-yellow-400 rounded-md px-2 py-1 text-xs outline-none bg-white"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          min={1}
          step={1}
          value={duration}
          onChange={e => setDuration(e.target.value)}
          onKeyDown={handleKey}
          placeholder="days"
          className="w-16 border border-yellow-400 rounded-md px-2 py-1 text-xs text-center outline-none bg-white"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={preds}
          onChange={e => setPreds(e.target.value)}
          onKeyDown={handleKey}
          placeholder="e.g. 1.1 FS"
          className="w-24 border border-yellow-400 rounded-md px-2 py-1 text-xs outline-none bg-white"
        />
      </td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        <button onClick={handleSave} disabled={saving || !name.trim()} className="text-emerald-500 font-bold text-sm mr-1.5 disabled:opacity-40">✓</button>
        <button onClick={onCancel} className="text-red-300 text-sm">✕</button>
      </td>
    </tr>
  )
}
```

- [ ] **Step 4: Wire `onAddBelow` in TemplateTable to insert a new task**

In `TemplateTable`, implement the handler and inject it into each `TaskRow`. When `+` is clicked on a parent row, insert a new child. When clicked on a child row, insert a new sibling.

Add a helper and the inline add row rendering. Update `TemplateTable` to render `addingAfter` state:

```jsx
// Inside TemplateTable, add this handler:
const handleAddBelow = (task) => {
  const hasChildren = tasks.some(t => t.parent_id === task.id)
  // If parent (no children yet, or already has children) → add child
  // If child → add sibling
  if (!task.parent_id) {
    // It's a parent: add a child
    setAddingAfter({
      parentId:        task.id,
      phase:           task.phase,
      isChild:         true,
      afterSortOrder:  Math.max(...tasks.filter(t => t.parent_id === task.id).map(t => t.sort_order), task.sort_order),
    })
  } else {
    // It's a child: add sibling (same parent)
    setAddingAfter({
      parentId:        task.parent_id,
      phase:           task.phase,
      isChild:         true,
      afterSortOrder:  task.sort_order,
    })
  }
}

const handleSaveNew = async ({ name, duration, preds }) => {
  if (!name.trim() || !addingAfter) return
  const newSortOrder = addingAfter.afterSortOrder + 0.5  // between existing rows
  const { error } = await supabase
    .from('work_program_template_tasks')
    .insert({
      sort_order:       newSortOrder,
      phase:            addingAfter.phase,
      milestone_name:   name.trim(),
      parent_id:        addingAfter.parentId,
      duration:         duration ? parseInt(duration, 10) : null,
      predecessor_text: preds.trim() || null,
    })
  if (error) { showToast(error.message, 'error'); return }
  // Re-normalize sort_orders after insert so decimals don't accumulate
  showToast('Task added.')
  setAddingAfter(null)
  onReload()
}
```

> **Note on sort_order:** Using `afterSortOrder + 0.5` for insertion is acceptable for now. After each insert, the reload will display correct order. No need to renormalize unless sort_order values overflow (very unlikely with integer precision).

- [ ] **Step 5: Wire delete in TemplateTable**

```jsx
const handleDelete = async (task) => {
  const childCount = tasks.filter(t => t.parent_id === task.id).length
  if (childCount > 0) {
    setConfirmDelete({ id: task.id, name: task.milestone_name, childCount })
    return
  }
  await doDelete(task.id)
}

const doDelete = async (id) => {
  const { error } = await supabase
    .from('work_program_template_tasks')
    .delete()
    .eq('id', id)
  if (error) { showToast(error.message, 'error'); return }
  showToast('Task deleted.')
  setConfirmDelete(null)
  onReload()
}
```

Add a confirmation banner above the table (inside the main div) when `confirmDelete` is set:

```jsx
{confirmDelete && (
  <div className="mb-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-sm">
    <span className="text-red-700">
      Delete <strong>"{confirmDelete.name}"</strong> and its {confirmDelete.childCount} sub-task{confirmDelete.childCount !== 1 ? 's' : ''}?
    </span>
    <div className="flex gap-2 ml-4">
      <button onClick={() => setConfirmDelete(null)} className="px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs">Cancel</button>
      <button onClick={() => doDelete(confirmDelete.id)} className="px-3 py-1 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600">Delete</button>
    </div>
  </div>
)}
```

Also render the `InlineRow` in the correct position within the table (after the task that triggered the add). Thread `addingAfter`, `editingId`, and all handlers through `TemplateTable` → `PhaseSection` → `TaskRow`.

- [ ] **Step 6: Add "+ Add top-level task to [Phase]" row at the bottom of each phase section**

At the end of each `PhaseSection`'s children, add:

```jsx
<tr className="bg-gray-50">
  <td colSpan={5} className="px-3 py-2">
    <button
      onClick={() => setAddingAfter({
        parentId:       null,
        phase:          phase.key,
        isChild:        false,
        afterSortOrder: Math.max(...phaseTasks.map(t => t.sort_order), 0),
      })}
      className="text-[#ed6055] text-[11px] font-semibold hover:underline"
    >
      + Add top-level task to {phase.label}
    </button>
  </td>
</tr>
```

- [ ] **Step 7: Test in browser**

- Add a child task to "Prepare Preliminary Technical Due Diligence" — confirm it appears indented
- Edit an existing task's duration — confirm it saves
- Delete a leaf task — confirm it disappears
- Delete a parent task — confirm the confirmation banner appears and cascade works

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/WorkProgramTemplate.jsx
git commit -m "feat: inline add/edit/delete in Work Program Template editor"
```

---

## Task 6: New Baseline Modal — Load Template Prompt + Copy

**Files:**
- Modify: `src/components/GanttModal.jsx`

- [ ] **Step 1: Import copyTemplateToBaseline**

At the top of `GanttModal.jsx`, add:

```js
import { copyTemplateToBaseline } from '../lib/templateUtils'
```

- [ ] **Step 2: Add state for template count and load preference**

Inside `GanttContent`, alongside existing state declarations (~line 1117):

```js
const [templateCount,   setTemplateCount]   = useState(0)
const [loadTemplate,    setLoadTemplate]     = useState(true)
```

- [ ] **Step 3: Fetch template count when the "New Baseline" modal opens**

Find where `setShowNewBLModal(true)` is called (~line 1880). After that call (or wrap in a handler), fetch the count:

```js
const handleOpenNewBLModal = async () => {
  setNewBLName('')
  setShowNewBLModal(true)
  setLoadTemplate(true)
  const { count } = await supabase
    .from('work_program_template_tasks')
    .select('*', { count: 'exact', head: true })
  setTemplateCount(count ?? 0)
}
```

Replace the existing `onClick` that calls `setShowNewBLModal(true)` with `handleOpenNewBLModal`.

- [ ] **Step 4: Update `handleCreateBaseline` to call `copyTemplateToBaseline` when Yes**

Find `handleCreateBaseline` (~line 1249). After the baseline is created and `data` is confirmed, add:

```js
const handleCreateBaseline = async () => {
  const label = newBLName.trim()
  if (!label) return
  const { data, error } = await supabase
    .from('milestone_baselines')
    .insert({ project_id: project.id, label, scheduling_mode: 'auto', start_date: null })
    .select('id, label, created_at, scheduling_mode, start_date')
    .single()
  if (error) { showToast(error.message, 'error'); return }
  if (!data) { showToast('Failed to create baseline.', 'error'); return }

  // Load template if selected
  if (loadTemplate && templateCount > 0) {
    const { error: copyErr } = await copyTemplateToBaseline(data.id, supabase, project.id)
    if (copyErr) {
      showToast(`Baseline created but template copy failed: ${copyErr}`, 'error')
    } else {
      showToast(`Baseline "${label}" created with standard work program.`, 'success')
    }
  } else {
    showToast(`Baseline "${label}" created.`, 'success')
  }

  setBaselines(prev => [...prev, data])
  setActiveBL(data.id)
  setAddForm(null)
  setAddChildParentId(null)
  setAddChildPhase(null)
  setAddChildForm(null)
  setNewBLName('')
  setShowNewBLModal(false)
  loadMilestones(data.id)
}
```

- [ ] **Step 5: Add Yes/No UI to the New Baseline modal**

Find the New Baseline modal JSX (~line 1973). After the baseline name `<input>` and before the Cancel/Create buttons, add:

```jsx
{templateCount > 0 && (
  <div className="mb-4">
    <p className="text-xs font-semibold text-gray-700 mb-2">Load standard work program?</p>
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => setLoadTemplate(true)}
        className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition ${loadTemplate ? 'border-[#ed6055] bg-red-50 text-[#ed6055]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
      >
        Yes — Pre-fill with template
      </button>
      <button
        type="button"
        onClick={() => setLoadTemplate(false)}
        className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition ${!loadTemplate ? 'border-gray-400 bg-gray-100 text-gray-700' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
      >
        No — Start blank
      </button>
    </div>
  </div>
)}
```

There are two copies of the modal (desktop and mobile ~line 2007). Apply the same change to both.

- [ ] **Step 6: Test end-to-end**

1. Open any project → Work Program tab
2. Click the baseline dropdown → "+ New Baseline"
3. Confirm the "Load standard work program?" prompt appears (Yes pre-selected)
4. Type `"Test BL"` → click Create
5. Confirm the Gantt populates with all template tasks
6. Open another project → repeat with "No" → confirm Gantt is empty

- [ ] **Step 7: Commit**

```bash
git add src/components/GanttModal.jsx
git commit -m "feat: add load template prompt to New Baseline modal"
```

---

## Self-Review

**Spec coverage:**
- ✅ `work_program_template_tasks` table with all required fields — Task 1
- ✅ Seeded from Jab Residences — Task 2
- ✅ Template editor in Settings → Work Program Template — Tasks 4 + 5
- ✅ Columns: # · Activity · Duration · Predecessors · Edit/Delete — Task 4
- ✅ Phase as section headers, parent/child via indentation — Task 4
- ✅ Hover + to add inline (parent → child, child → sibling) — Task 5
- ✅ "+ Add top-level task" per phase — Task 5
- ✅ Inline row: yellow, Enter/Esc, ✓/✕ — Tasks 4 + 5
- ✅ Edit inline with same yellow row — Task 5
- ✅ Delete with confirm for parent+children cascade — Task 5
- ✅ New Baseline modal Yes/No prompt — Task 6
- ✅ Template count check (hide prompt if empty) — Task 6
- ✅ `copyTemplateToBaseline` inserts milestones + dependencies — Task 3
- ✅ Predecessor text resolution — Task 3
- ✅ Admin-only route `/admin/work-program-template` — Task 4
- ✅ RLS: all authenticated read, admin write — Task 1

**Placeholder scan:** None found.

**Type consistency:** `copyTemplateToBaseline(baselineId, supabase, projectId)` called with matching signature in Task 6. `assignSeqNumbers(tasks)` returns `Map<string, string>` used consistently in Tasks 3 and 4. `parseTemplatePredecessors(text, seqToId)` takes `Map<string, string>` built in Task 3.
