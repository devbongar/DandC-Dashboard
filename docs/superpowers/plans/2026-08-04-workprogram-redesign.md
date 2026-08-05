# Work Program Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-baseline task row model with a single-task-per-project model that mirrors the desktop scheduler schema, with named baseline snapshots for comparison.

**Architecture:** Tasks are stored once per project in `workprogram_tasks`. Named baselines in `workprogram_baselines` capture frozen snapshots of planned dates in `workprogram_baseline_snapshots`. The desktop app writes directly to `workprogram_tasks`. GanttModal loads all tasks for a project, merges snapshot dates when a baseline is selected, and transforms field names to match existing rendering code.

**Tech Stack:** React 19, Supabase (PostgreSQL + supabase-js v2), Tailwind CSS v3

---

## File Map

| File | Change |
|---|---|
| `supabase/migrations/20260804000002_workprogram_redesign.sql` | Create — new tables, migrate data, drop old |
| `src/lib/templateUtils.js` | Rewrite — no more per-baseline copies; insert tasks once, snapshot on baseline create |
| `src/lib/ganttDependencies.js` | Update — parse dependencies from JSONB column instead of separate table |
| `src/components/GanttModal.jsx` | Rewrite data layer — queries, baseline management, dep saves |
| `src/lib/reportData.js` | Update — query `workprogram_tasks` instead of `workprogram_activities` |
| `src/components/SCurveTab.jsx` | Check for `workprogram_activities` reference — update if found |

---

## New Schema

### `workprogram_tasks` (replaces `workprogram_activities`)
```
id               uuid PK
project_id       uuid FK projects CASCADE
sort_order       integer DEFAULT 0
milestone_name   text NOT NULL
baseline_start   date             -- desktop: baseline_start
baseline_end     date             -- desktop: baseline_end
baseline_duration numeric         -- desktop: baseline_duration
forecast_start   date             -- desktop: forecast_start
forecast_end     date             -- desktop: forecast_end
actual_start     date             -- desktop: actual_start
actual_end       date             -- desktop: actual_end
parent_id        uuid self-ref SET NULL
remaining_duration numeric        -- desktop: remaining_duration
dependencies     jsonb DEFAULT '[]'  -- [{id, type, lag}] desktop format
phase            text             -- web-only: Gantt grouping
status           text             -- web-only: completion tracking
created_at       timestamptz DEFAULT now()
```

### `workprogram_baselines` (replaces `milestone_baselines`)
```
id         uuid PK
project_id uuid FK projects CASCADE
name       text NOT NULL
created_at timestamptz DEFAULT now()
```

### `workprogram_baseline_snapshots` (new)
```
baseline_id  uuid FK workprogram_baselines CASCADE
task_id      uuid FK workprogram_tasks CASCADE
baseline_start date
baseline_end   date
PRIMARY KEY (baseline_id, task_id)
```

---

## GanttModal field mapping (transform on load, no rendering changes)

```js
// Applied in loadMilestones() after fetching workprogram_tasks
const tasks = rawTasks.map(t => ({
  ...t,
  planned_start:   snapshotMap[t.id]?.baseline_start ?? t.baseline_start,
  planned_end:     snapshotMap[t.id]?.baseline_end   ?? t.baseline_end,
  projected_start: t.forecast_start,
  projected_end:   t.forecast_end,
}))
```

When a baseline is selected, `snapshotMap` is populated from `workprogram_baseline_snapshots`. This means all existing `m.planned_start/end`, `m.projected_start/end` references in GanttModal's rendering code require **zero changes**.

---

## Desktop sync column mapping (for reference)

| Desktop `tasks` field | Supabase `workprogram_tasks` column |
|---|---|
| `task_name` | `milestone_name` |
| `wbs_order` | `sort_order` |
| `baseline_start` | `baseline_start` |
| `baseline_end` | `baseline_end` |
| `baseline_duration` | `baseline_duration` |
| `forecast_start` | `forecast_start` |
| `forecast_end` | `forecast_end` |
| `actual_start` | `actual_start` |
| `actual_end` | `actual_end` |
| `remaining_duration` | `remaining_duration` |
| `dependencies` | `dependencies` |
| `parent_id` | `parent_id` |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260804000002_workprogram_redesign.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ── 1. New tables ─────────────────────────────────────────────────────────────

CREATE TABLE workprogram_tasks (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sort_order         integer     NOT NULL DEFAULT 0,
  milestone_name     text        NOT NULL,
  baseline_start     date,
  baseline_end       date,
  baseline_duration  numeric,
  forecast_start     date,
  forecast_end       date,
  actual_start       date,
  actual_end         date,
  parent_id          uuid        REFERENCES workprogram_tasks(id) ON DELETE SET NULL,
  remaining_duration numeric,
  dependencies       jsonb       NOT NULL DEFAULT '[]',
  phase              text,
  status             text,
  created_at         timestamptz DEFAULT now()
);

CREATE TABLE workprogram_baselines (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE workprogram_baseline_snapshots (
  baseline_id    uuid NOT NULL REFERENCES workprogram_baselines(id) ON DELETE CASCADE,
  task_id        uuid NOT NULL REFERENCES workprogram_tasks(id) ON DELETE CASCADE,
  baseline_start date,
  baseline_end   date,
  PRIMARY KEY (baseline_id, task_id)
);

-- ── 2. Migrate baselines ───────────────────────────────────────────────────────

INSERT INTO workprogram_baselines (id, project_id, name, created_at)
SELECT id, project_id, name, created_at
FROM milestone_baselines
ON CONFLICT DO NOTHING;

-- ── 3. Migrate tasks (one row per task from the last baseline per project) ────
-- Collapse per-baseline rows → single task per unique (project_id, phase, sort_order, milestone_name)
-- We use the row with the highest sort_order baseline as source of truth for dates.

INSERT INTO workprogram_tasks (
  id, project_id, sort_order, milestone_name,
  baseline_start, baseline_end, baseline_duration,
  forecast_start, forecast_end,
  actual_start, actual_end,
  parent_id, phase, status, created_at,
  dependencies
)
SELECT DISTINCT ON (wa.project_id, wa.sort_order, wa.milestone_name)
  wa.id,
  wa.project_id,
  wa.sort_order,
  wa.milestone_name,
  wa.planned_start   AS baseline_start,
  wa.planned_end     AS baseline_end,
  wa.duration        AS baseline_duration,
  wa.projected_start AS forecast_start,
  wa.projected_end   AS forecast_end,
  wa.actual_start,
  wa.actual_end,
  wa.parent_id,
  wa.phase,
  NULL               AS status,
  wa.created_at,
  '[]'::jsonb        AS dependencies
FROM workprogram_activities wa
ORDER BY wa.project_id, wa.sort_order, wa.milestone_name, wa.baseline_id DESC;

-- ── 4. Migrate dependencies to JSONB on tasks ─────────────────────────────────
-- For each task that exists in workprogram_tasks, build the dependencies JSON
-- from workprogram_dependencies rows where to_id matches the task.

UPDATE workprogram_tasks t
SET dependencies = COALESCE((
  SELECT jsonb_agg(jsonb_build_object(
    'id',   d.from_id,
    'type', d.type,
    'lag',  COALESCE(d.lag, 0)
  ))
  FROM workprogram_dependencies d
  WHERE d.to_id = t.id
), '[]'::jsonb);

-- ── 5. Create baseline snapshots from existing baseline data ──────────────────
-- For each baseline, snapshot the planned dates of matching tasks.

INSERT INTO workprogram_baseline_snapshots (baseline_id, task_id, baseline_start, baseline_end)
SELECT
  wa.baseline_id,
  t.id AS task_id,
  wa.planned_start AS baseline_start,
  wa.planned_end   AS baseline_end
FROM workprogram_activities wa
JOIN workprogram_tasks t
  ON t.id = wa.id
  OR (t.project_id = wa.project_id
      AND t.sort_order = wa.sort_order
      AND t.milestone_name = wa.milestone_name)
WHERE wa.planned_start IS NOT NULL OR wa.planned_end IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── 6. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_workprogram_tasks_project_id ON workprogram_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_workprogram_baselines_project_id ON workprogram_baselines(project_id);
CREATE INDEX IF NOT EXISTS idx_workprogram_snapshots_baseline ON workprogram_baseline_snapshots(baseline_id);

-- ── 7. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE workprogram_tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE workprogram_baselines          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workprogram_baseline_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workprogram_tasks_admin"
  ON workprogram_tasks FOR ALL
  USING      (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "workprogram_tasks_read"
  ON workprogram_tasks FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "workprogram_baselines_admin"
  ON workprogram_baselines FOR ALL
  USING      (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "workprogram_baselines_read"
  ON workprogram_baselines FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "workprogram_snapshots_admin"
  ON workprogram_baseline_snapshots FOR ALL
  USING      (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "workprogram_snapshots_read"
  ON workprogram_baseline_snapshots FOR SELECT
  USING (auth.role() = 'authenticated');

-- ── 8. Drop old tables ────────────────────────────────────────────────────────
-- NOTE: Run these only after verifying new tables look correct in Supabase.

DROP TABLE IF EXISTS workprogram_dependencies;
DROP TABLE IF EXISTS workprogram_activities;
DROP TABLE IF EXISTS milestone_baselines;
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

Run the SQL above in your Supabase dashboard → SQL Editor. Verify:
- `workprogram_tasks` has rows
- `workprogram_baselines` has rows
- `workprogram_baseline_snapshots` has rows (may be sparse if old data had no planned dates)

- [ ] **Step 3: Mark migration applied**

```bash
npx supabase migration repair --status applied 20260804000002
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260804000002_workprogram_redesign.sql
git commit -m "feat: redesign workprogram schema to single-task-per-project model"
```

---

## Task 2: Update `ganttDependencies.js`

**Files:**
- Modify: `src/lib/ganttDependencies.js`

The file uses `d.from_id`, `d.to_id` shaped objects from the old `workprogram_dependencies` table. Dependencies are now JSONB on the task: `[{id, type, lag}]` where `id` is the predecessor task id.

Need to add a converter function that expands task dependencies into the old row shape for `isViolated()` and `buildDependencyPaths()`.

- [ ] **Step 1: Add `expandDependencies` helper at top of file**

```js
// Converts JSONB dependencies array on each task into flat dep rows.
// Input: tasks array where each task has .dependencies = [{id, type, lag}]
// Output: [{from_id, to_id, type, lag}] — same shape as old workprogram_dependencies rows
export function expandDependencies(tasks) {
  const rows = []
  for (const task of tasks) {
    const deps = Array.isArray(task.dependencies) ? task.dependencies : []
    for (const dep of deps) {
      if (dep.id && dep.type) {
        rows.push({ from_id: dep.id, to_id: task.id, type: dep.type, lag: dep.lag ?? 0 })
      }
    }
  }
  return rows
}
```

- [ ] **Step 2: Update `isViolated` field references**

The function at line ~61 uses `fromM.planned_start`, `fromM.planned_end`. These are populated by GanttModal's transform on load (see Task 3), so no change needed here.

- [ ] **Step 3: Verify `buildTree` is unaffected**

`buildTree` uses `m.parent_id` and `m.sort_order` — both still exist in `workprogram_tasks`. No changes needed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ganttDependencies.js
git commit -m "feat: add expandDependencies helper for JSONB dep format"
```

---

## Task 3: Rewrite `templateUtils.js`

**Files:**
- Modify: `src/lib/templateUtils.js`

`copyTemplateToBaseline` currently inserts tasks into `workprogram_activities` with a `baseline_id`. New behavior: insert tasks into `workprogram_tasks` (no baseline_id), then snapshot them into a new `workprogram_baselines` record.

`copyBaselineToBaseline` currently copies task rows between baselines. New behavior: create a snapshot of the current task dates (no task duplication needed).

- [ ] **Step 1: Rewrite `copyTemplateToBaseline`**

Replace the full function body. New signature is the same but `baselineId` becomes the ID for the new `workprogram_baselines` record (already created by caller):

```js
/**
 * Copies work_program_template_tasks into workprogram_tasks for a project.
 * Then snapshots planned dates into workprogram_baseline_snapshots for the given baselineId.
 * If tasks already exist for the project, skips insert and only creates snapshot.
 *
 * @param {string} baselineId - workprogram_baselines.id (already created by caller)
 * @param {string} projectId
 * @param {object} supabase
 * @returns {Promise<{error: string|null}>}
 */
export async function copyTemplateToBaseline(baselineId, projectId, supabase) {
  // Check if tasks already exist for this project
  const { data: existing } = await supabase
    .from('workprogram_tasks')
    .select('id')
    .eq('project_id', projectId)
    .limit(1)

  if (!existing?.length) {
    // Insert tasks from template
    const { data: templateTasks, error: tErr } = await supabase
      .from('work_program_template_tasks')
      .select('*')
      .order('sort_order')
    if (tErr) return { error: tErr.message }
    if (!templateTasks?.length) return { error: null }

    const seqKey = new Map(templateTasks.map((t, i) => [t.id, i + 1]))
    const oldToNewId = new Map()

    const parents  = templateTasks.filter(t => !t.parent_id)
    const children = templateTasks.filter(t =>  t.parent_id)

    const { data: insertedParents, error: pErr } = await supabase
      .from('workprogram_tasks')
      .insert(parents.map(t => ({
        project_id:     projectId,
        sort_order:     seqKey.get(t.id),
        milestone_name: t.task_name,
        phase:          t.phase,
        baseline_duration: t.duration,
        dependencies:   '[]',
      })))
      .select('id, sort_order')
    if (pErr) return { error: pErr.message }

    const parentSortToId = new Map((insertedParents ?? []).map(r => [Number(r.sort_order), r.id]))
    for (const t of parents) {
      const newId = parentSortToId.get(seqKey.get(t.id))
      if (newId) oldToNewId.set(t.id, newId)
    }

    if (children.length) {
      const childPayloads = children.map(t => {
        const newParentId = oldToNewId.get(t.parent_id)
        if (!newParentId) return null
        return {
          project_id:     projectId,
          sort_order:     seqKey.get(t.id),
          milestone_name: t.task_name,
          phase:          t.phase,
          parent_id:      newParentId,
          baseline_duration: t.duration,
          dependencies:   '[]',
        }
      }).filter(Boolean)

      const { data: insertedChildren, error: cErr } = await supabase
        .from('workprogram_tasks')
        .insert(childPayloads)
        .select('id, sort_order')
      if (cErr) return { error: cErr.message }

      const childSortToId = new Map((insertedChildren ?? []).map(r => [Number(r.sort_order), r.id]))
      for (const t of children) {
        const newId = childSortToId.get(seqKey.get(t.id))
        if (newId) oldToNewId.set(t.id, newId)
      }
    }
  }

  // Snapshot current tasks into the baseline (baseline_start/end may be null for new tasks)
  return snapshotTasksToBaseline(baselineId, projectId, supabase)
}
```

- [ ] **Step 2: Replace `copyBaselineToBaseline` with `snapshotTasksToBaseline`**

```js
/**
 * Snapshots current task baseline_start/baseline_end into workprogram_baseline_snapshots.
 * Used when creating a new named baseline.
 *
 * @param {string} baselineId - workprogram_baselines.id
 * @param {string} projectId
 * @param {object} supabase
 * @returns {Promise<{error: string|null}>}
 */
export async function snapshotTasksToBaseline(baselineId, projectId, supabase) {
  const { data: tasks, error: tErr } = await supabase
    .from('workprogram_tasks')
    .select('id, baseline_start, baseline_end')
    .eq('project_id', projectId)
  if (tErr) return { error: tErr.message }
  if (!tasks?.length) return { error: null }

  const snapshots = tasks.map(t => ({
    baseline_id:    baselineId,
    task_id:        t.id,
    baseline_start: t.baseline_start,
    baseline_end:   t.baseline_end,
  }))

  const { error: sErr } = await supabase
    .from('workprogram_baseline_snapshots')
    .upsert(snapshots, { onConflict: 'baseline_id,task_id' })
  return { error: sErr?.message ?? null }
}
```

- [ ] **Step 3: Update exports**

Replace `export { copyTemplateToBaseline, copyBaselineToBaseline }` with:
```js
export { copyTemplateToBaseline, snapshotTasksToBaseline }
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/templateUtils.js
git commit -m "refactor: templateUtils uses workprogram_tasks + snapshot model"
```

---

## Task 4: Rewrite GanttModal data layer

**Files:**
- Modify: `src/components/GanttModal.jsx`

This is the largest task. Only the data layer changes — all rendering, drag, bar display, and CSV export code is unchanged.

- [ ] **Step 1: Update import**

```js
// Change line 10
import { copyTemplateToBaseline, snapshotTasksToBaseline } from '../lib/templateUtils'
```

- [ ] **Step 2: Update `loadBaselines` (around line 1495)**

```js
const loadBaselines = async () => {
  const { data: bls } = await supabase
    .from('workprogram_baselines')          // was: milestone_baselines
    .select('*')
    .eq('project_id', project.id)
    .order('created_at')
  setBaselines(bls ?? [])
  setActiveBL(bls?.length > 0 ? bls[bls.length - 1].id : null)
}
```

- [ ] **Step 3: Rewrite `loadMilestones` (around line 1509)**

Replace the function body:

```js
const loadMilestones = async (blId) => {
  setLoading(true)
  const resolvedId = blId ?? activeBL

  // Load all tasks for the project (no baseline_id filter)
  const [{ data: rawTasks }, { data: snapshots }] = await Promise.all([
    supabase
      .from('workprogram_tasks')
      .select('*')
      .eq('project_id', project.id)
      .order('sort_order'),
    resolvedId
      ? supabase
          .from('workprogram_baseline_snapshots')
          .select('task_id, baseline_start, baseline_end')
          .eq('baseline_id', resolvedId)
      : Promise.resolve({ data: [] }),
  ])

  const snapshotMap = Object.fromEntries(
    (snapshots ?? []).map(s => [s.task_id, s])
  )

  // Expand dependencies JSONB → flat dep rows for visualization
  const tasks = (rawTasks ?? []).map(t => ({
    ...t,
    // Map to field names used by rendering code
    planned_start:   snapshotMap[t.id]?.baseline_start ?? t.baseline_start,
    planned_end:     snapshotMap[t.id]?.baseline_end   ?? t.baseline_end,
    projected_start: t.forecast_start,
    projected_end:   t.forecast_end,
    // Parse dependencies JSONB
    _depsParsed: Array.isArray(t.dependencies) ? t.dependencies : [],
  }))

  const { expandDependencies } = await import('../lib/ganttDependencies')
  const depRows = expandDependencies(tasks)

  setMilestones(tasks)
  setDependencies(depRows)
  setLoading(false)
}
```

- [ ] **Step 4: Update `handleInlineSave` task insert (around line 1612)**

Remove `baseline_id` from insert. Change table name:

```js
const { error } = await supabase.from('workprogram_tasks').insert({  // was: workprogram_activities
  project_id:     project.id,
  // baseline_id removed
  phase:          inlineAdd.phase,
  parent_id:      parentId,
  milestone_name: inlineAddName.trim(),
  sort_order,
  dependencies:   [],
})
```

Also update the sort_order query:
```js
// Change .from('workprogram_activities') to .from('workprogram_tasks')
// Remove .eq('baseline_id', activeBL) filter
const { data: maxRow } = await supabase
  .from('workprogram_tasks')
  .select('sort_order')
  .eq('project_id', project.id)
  .eq('phase', inlineAdd.phase)
  .is('parent_id', null)
  .order('sort_order', { ascending: false })
  .limit(1)
```

- [ ] **Step 5: Update `handleDelete` (around line 1582)**

```js
const { error } = await supabase
  .from('workprogram_tasks')        // was: workprogram_activities
  .delete()
  .eq('id', id)
// Remove workprogram_dependencies delete — cascade handles it via ON DELETE CASCADE on snapshots
```

- [ ] **Step 6: Update `handleSave` (update task fields, around line 1599)**

```js
// Map display field names back to DB column names before saving
const dbUpdates = { ...updates }
if ('planned_start'   in dbUpdates) { dbUpdates.baseline_start = dbUpdates.planned_start;   delete dbUpdates.planned_start }
if ('planned_end'     in dbUpdates) { dbUpdates.baseline_end   = dbUpdates.planned_end;     delete dbUpdates.planned_end }
if ('projected_start' in dbUpdates) { dbUpdates.forecast_start = dbUpdates.projected_start; delete dbUpdates.projected_start }
if ('projected_end'   in dbUpdates) { dbUpdates.forecast_end   = dbUpdates.projected_end;   delete dbUpdates.projected_end }

const { error } = await supabase
  .from('workprogram_tasks')        // was: workprogram_activities
  .update(dbUpdates)
  .eq('id', milestoneId)
```

- [ ] **Step 7: Update `handleSavePreds` — write deps to JSONB (around line 1538)**

```js
// parsedDeps shape: [{fromId, type, lagDays}]
// Store as JSONB: [{id, type, lag}]
const depsJson = parsedDeps.map(d => ({ id: d.fromId, type: d.type, lag: d.lagDays ?? 0 }))
const { error } = await supabase
  .from('workprogram_tasks')
  .update({ dependencies: depsJson })
  .eq('id', milestoneId)
if (error) { showToast(error.message, 'error'); return }
await loadMilestones()
```

- [ ] **Step 8: Update `handleSaveDuration` (around line 1599)**

```js
const { error } = await supabase
  .from('workprogram_tasks')        // was: workprogram_activities
  .update({ duration: value, baseline_duration: value })
  .eq('id', milestoneId)
```

- [ ] **Step 9: Update `handleSaveDate` (around line 2204)**

```js
// Map display field names to DB column names
const fieldMap = {
  planned_start:   'baseline_start',
  planned_end:     'baseline_end',
  projected_start: 'forecast_start',
  projected_end:   'forecast_end',
  actual_start:    'actual_start',
  actual_end:      'actual_end',
}
const dbField = fieldMap[field] ?? field
const { error } = await supabase
  .from('workprogram_tasks')
  .update({ [dbField]: value })
  .eq('id', milestoneId)
```

- [ ] **Step 10: Commit**

```bash
git add src/components/GanttModal.jsx
git commit -m "refactor: GanttModal data layer uses workprogram_tasks + snapshot model"
```

---

## Task 5: Rewrite GanttModal baseline management

**Files:**
- Modify: `src/components/GanttModal.jsx`

- [ ] **Step 1: Update `handleCreateBaseline` (around line 1837)**

```js
const handleCreateBaseline = async () => {
  const label = newBLName.trim()
  if (!label) return
  setCreatingBL(true)
  try {
    // Create the baseline record
    const { data, error: blErr } = await supabase
      .from('workprogram_baselines')       // was: milestone_baselines
      .insert({ project_id: project.id, name: label })
      .select('id')
      .single()
    if (blErr || !data) { showToast(blErr?.message ?? 'Failed to create baseline', 'error'); return }

    // Check if tasks exist; if not, copy from template first
    const { data: existingTasks } = await supabase
      .from('workprogram_tasks')
      .select('id')
      .eq('project_id', project.id)
      .limit(1)

    if (!existingTasks?.length) {
      const { error: copyErr } = await copyTemplateToBaseline(data.id, project.id, supabase)
      if (copyErr) { showToast(copyErr, 'error'); return }
    } else {
      // Snapshot current task baseline dates
      const { error: snapErr } = await snapshotTasksToBaseline(data.id, project.id, supabase)
      if (snapErr) { showToast(snapErr, 'error'); return }
    }

    const { data: newBLs } = await supabase
      .from('workprogram_baselines')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at')
    if (newBLs) { setBaselines(newBLs); setActiveBL(data.id) }
    setNewBLName('')
    showToast('Baseline created.', 'success')
  } finally {
    setCreatingBL(false)
  }
}
```

- [ ] **Step 2: Update `handleDeleteBaseline` (around line 2031)**

```js
const { error } = await supabase
  .from('workprogram_baselines')    // was: milestone_baselines
  .delete()
  .eq('id', blId)
// Snapshots cascade-delete automatically
```

- [ ] **Step 3: Update `handleImport` baseline creation (around line 1985)**

```js
// Create baseline record
const { data: blData, error: blErr } = await supabase
  .from('workprogram_baselines')    // was: milestone_baselines
  .insert({ project_id: project.id, name: label })
  .select('id')
  .single()
if (blErr || !blData) { showToast('Failed to create baseline.', 'error'); return }
const blId = blData.id
```

- [ ] **Step 4: Update CSV import task insert (around line 2006)**

```js
const { error: mErr } = await supabase
  .from('workprogram_tasks')        // was: workprogram_activities
  .insert(newRows.map(r => ({
    project_id:     project.id,
    // no baseline_id
    phase:          r.phase,
    milestone_name: r.milestone_name,
    sort_order:     r.sort_order,
    parent_id:      r.parent_id,
    baseline_start: r.planned_start,
    baseline_end:   r.planned_end,
    actual_start:   r.actual_start,
    actual_end:     r.actual_end,
    forecast_start: r.projected_start,
    forecast_end:   r.projected_end,
    dependencies:   [],
  })))
// After insert, snapshot into baseline
await snapshotTasksToBaseline(blId, project.id, supabase)
```

- [ ] **Step 5: Remove `baseline_id` from session storage key (around line 1655)**

```js
// was: `milestone-order-${activeBL}`
// activeBL now refers to the selected baseline for comparison, not which task set to load
// Keep the key but it only affects sort order display, still fine
```

- [ ] **Step 6: Update all `from('milestone_baselines')` references**

Search for remaining `milestone_baselines` in GanttModal.jsx and replace with `workprogram_baselines`. Check lines around 2138, 2151, 2162.

- [ ] **Step 7: Commit**

```bash
git add src/components/GanttModal.jsx
git commit -m "refactor: GanttModal baseline management uses snapshot model"
```

---

## Task 6: Update `reportData.js` and `SCurveTab.jsx`

**Files:**
- Modify: `src/lib/reportData.js`
- Modify: `src/components/SCurveTab.jsx` (if needed)

- [ ] **Step 1: Update `reportData.js` milestone query**

Find the `workprogram_activities` query (around line 29) and update:

```js
supabase.from('workprogram_tasks')            // was: workprogram_activities
  .select('id, project_id, milestone_name, baseline_end, actual_end, status, baseline_duration')
  .in('project_id', ids)
  .order('sort_order', { ascending: true })
  .then(r => r.data ?? []),
```

Note: `target_date` column is gone; use `baseline_end` instead. Update any code in `projectMetrics()` that references the old field names.

- [ ] **Step 2: Check SCurveTab for workprogram_activities reference**

```bash
grep -n "workprogram_activities\|milestone_baselines" src/components/SCurveTab.jsx
```

If found, update to `workprogram_tasks` / `workprogram_baselines`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/reportData.js src/components/SCurveTab.jsx
git commit -m "refactor: update reportData and SCurveTab for new workprogram tables"
```

---

## Task 7: Smoke test

- [ ] **Step 1: Run dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify Gantt opens and loads tasks**

Open a project → Work Program tab → confirm tasks load without errors.

- [ ] **Step 3: Verify baseline create/select**

Create a new baseline → confirm snapshot is created → select it → confirm planned bar shifts.

- [ ] **Step 4: Verify task edit**

Edit a task's dates, name, duration → confirm saves without error.

- [ ] **Step 5: Verify dependency display**

Open a task's predecessor panel → confirm deps render correctly.

- [ ] **Step 6: Check browser console for 404/400 errors**

No references to old table names (`workprogram_activities`, `workprogram_dependencies`, `milestone_baselines`) should appear.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete workprogram redesign to single-task-per-project model"
git push
```
