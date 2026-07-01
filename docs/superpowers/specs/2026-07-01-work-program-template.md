# Work Program Template — Design Spec

## Goal

Maintain a global standard work program (tasks, durations, predecessors) that admins can edit in a Settings panel, and that gets pre-loaded into any new baseline with one click. This eliminates manual re-entry of the standard schedule for every new project.

---

## Database

### New table: `work_program_template_tasks`

```sql
CREATE TABLE work_program_template_tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order  integer NOT NULL,
  phase       text NOT NULL,
  milestone_name text NOT NULL,
  parent_id   uuid REFERENCES work_program_template_tasks(id) ON DELETE CASCADE,
  duration    integer,
  predecessor_text text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

**Fields:**
- `sort_order` — integer, controls display order within phase
- `phase` — groups tasks into sections (e.g. `'Initiation'`, `'Design'`, `'Permitting'`, `'Construction'`)
- `milestone_name` — task name
- `parent_id` — nullable; references another row in this table. Max 2 levels deep (parent → child). Parent tasks have `duration = null`.
- `duration` — calendar days, nullable. Null for parent tasks (date span derived from children by the Gantt).
- `predecessor_text` — stored as human-readable text using template sequence numbers (e.g. `"1.1 FS"`, `"2 FS+7"`). Resolved to real milestone IDs when copying into a baseline.

**Row-level security:** Reads allowed to all authenticated users. Writes restricted to admin role only.

**Seed data:** On migration, populate with the full Jab Residences work program task list (phases, parent/child hierarchy, task names). Durations and predecessor_text start null and are filled in by admins via the template editor.

---

## Settings Panel — Template Editor

### Location

**Settings → Work Program Template** — visible to admins only. Non-admin users do not see this menu item.

The Settings panel is a new route/view. For now it contains only the Work Program Template page. The left sidebar lists settings sections; "Work Program Template" is highlighted when active.

### Table Layout

Columns: **# · Activity · Duration (days) · Predecessors · [actions]**

- Phase displayed as bold uppercase section headers spanning all columns (not a column itself)
- Parent tasks: bold name, `—` for Duration, `—` or predecessor text for Predecessors
- Child tasks: indented (28px padding-left), normal weight name, integer duration, predecessor text
- Actions column: edit (✎) and delete (✕) icons, visible on hover

### Adding Tasks

No modal. All adding is inline:

- **Hover any row** → a red `+` button appears next to the task name in the Activity cell
  - Hover a **parent row** → clicking `+` inserts a new blank child row after that parent's last child
  - Hover a **child row** → clicking `+` inserts a new blank sibling row directly below
  - Max 2 levels enforced: the `+` button does not appear on child rows that already have children (the template is always parent → child, never grandchild)
- **"+ Add top-level task to [Phase]"** — always-visible text link at the bottom of each phase section. Clicking it inserts a new blank top-level (parent) row at the end of that phase.

**Inline new row appearance:**
- Yellow background (`#fffbeb`), yellow border (`#fbbf24`)
- Sequence number auto-assigned based on position
- Three inline inputs: Activity name (full width), Duration (60px, number), Predecessors (90px, text)
- **Enter** or ✓ to save, **Esc** or ✕ to cancel
- Saving immediately writes to `work_program_template_tasks`

### Editing Tasks

Clicking ✎ on any row opens it as an inline editable row (same yellow highlight pattern). Enter/✓ to save, Esc/✕ to cancel.

### Deleting Tasks

Clicking ✕ on a **child task** deletes that row only.

Clicking ✕ on a **parent task** deletes the parent and all its children (cascade). A confirmation toast: "Delete [task name] and its X sub-tasks?" with Confirm/Cancel before executing.

### Predecessor Text Format

Admins enter predecessors as sequence-number references matching the `#` column (e.g. `"1.1 FS"`, `"2 FS+7"`, `"1.3 SS"`). These are stored verbatim in `predecessor_text`. The system does not validate or parse this field in the editor — it is resolved at baseline-copy time.

---

## New Baseline Modal — Load Template Prompt

### Change to existing modal

The existing "New Baseline" modal (in `GanttModal.jsx`) gains a **Yes / No** selector below the baseline name field:

```
New Baseline

Baseline Name
[ BL0                        ]

Load standard work program?
[ ✓ Yes — Pre-fill with template ]  [ No — Start blank ]

[ Cancel ]  [ Create ]
```

- Default selection: **Yes**
- The Yes/No selector is only shown when at least one row exists in `work_program_template_tasks`. If the table is empty, the prompt is hidden and the baseline is created blank.

### On Create — "Yes" path

1. Insert the new `milestone_baselines` row (same as today)
2. Fetch all rows from `work_program_template_tasks` ordered by `sort_order`
3. Insert all rows as `project_milestones` for the new baseline:
   - Map `milestone_name`, `phase`, `duration` directly
   - Resolve `parent_id`: insert parent rows first, then child rows with the new parent milestone IDs
   - Resolve `predecessor_text` → `milestone_dependencies` rows:
     - Parse sequence numbers from `predecessor_text` (e.g. `"1.1 FS"` → find the milestone at position 1.1 in the new baseline)
     - Insert corresponding rows into `milestone_dependencies` with `from_id`, `to_id`, `type`, `lag_days`
     - If a predecessor reference cannot be resolved, skip it silently (do not block baseline creation)
4. Set `scheduling_mode: 'auto'`, `start_date: null` on the new baseline (same as current default)
5. Show toast: `"Baseline created with standard work program."`
6. Open the Gantt on the new baseline — user sees the pre-filled tasks

### On Create — "No" path

Same as current behavior. Baseline created empty.

---

## Predecessor Text Resolution

When copying template tasks into a baseline, `predecessor_text` is parsed as follows:

- Split on comma for multiple predecessors: `"1.1 FS, 2 SS+7"` → two dependencies
- Each token: `<seq> <type>[+<lag>]` where:
  - `<seq>` — sequence number matching the `#` column in the template (e.g. `1`, `1.1`, `2.3`)
  - `<type>` — `FS`, `SS`, `FF`, or `SF` (default `FS` if omitted)
  - `<lag>` — integer days, default 0

Sequence numbers are **global across the entire template** (not per-phase). Top-level tasks are numbered `1`, `2`, `3`… in `sort_order`. Their children are `1.1`, `1.2`, `2.1`, `2.2`, etc. A reference of `1.2` means the 2nd child of the 1st top-level task regardless of which phase it belongs to.

---

## Access Control

| Action | Who |
|---|---|
| View template editor (Settings) | Admins only |
| Read `work_program_template_tasks` | All authenticated users (needed at baseline-create time) |
| Write `work_program_template_tasks` | Admins only |
| Load template when creating baseline | All users who can create baselines |

---

## Files Changed

| File | Change |
|---|---|
| `supabase/migrations/` | New migration: create `work_program_template_tasks`, seed with Jab Residences tasks |
| `src/components/GanttModal.jsx` | Add Yes/No template prompt to New Baseline modal; add copy-template logic |
| `src/components/SettingsPage.jsx` (new) | Settings panel with Work Program Template editor |
| `src/App.jsx` (or router) | Add `/settings` route, admin-only |

---

## Edge Cases

| Case | Behaviour |
|---|---|
| Template table is empty | Prompt hidden; baseline created blank |
| Predecessor references unresolvable seq number | Skip silently; log to console |
| User creates baseline with "Yes" but template is very large | All inserts done in a single `Promise.all` batch; show loading state on Create button |
| Admin deletes a parent task | Confirm dialog warns about child deletion; cascade on confirm |
| Non-admin visits `/settings` | Redirect to home or show "Access denied" |
