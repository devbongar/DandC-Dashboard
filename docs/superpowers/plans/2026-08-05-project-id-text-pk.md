# Project ID Text PK (PRJ-000001) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace projects.id UUID with a sequential text PK (PRJ-000001) and update all FK references and JS code.

**Architecture:** A Postgres sequence + trigger auto-assigns PRJ-XXXXXX on insert. All FK columns change from uuid to text. JS code removes any reliance on UUID format for project IDs.

**Tech Stack:** React 19, Supabase (PostgreSQL + supabase-js v2), Vitest

---

## What You're Changing

### Database layer

`projects.id` is currently `uuid DEFAULT gen_random_uuid() PRIMARY KEY`. Fifteen child tables have `project_id uuid NOT NULL REFERENCES projects(id)`.

After this plan, `projects.id` will be `text NOT NULL PRIMARY KEY` constrained to `^PRJ-[0-9]{6}$`. A Postgres BEFORE INSERT trigger reads from `projects_code_seq` to auto-assign the ID when the caller omits it. All fifteen FK columns become `text`.

### JS layer

All existing JS uses of `project.id` and `project_id` are opaque string comparisons — React keys, Supabase filter args, sessionStorage key suffixes, storage path prefixes. None of them branch on UUID format. **No functional changes are needed in any of those 60+ call sites.**

The only real JS changes are:
1. A new utility module `src/lib/projectCode.js` (format helper + format validator)
2. A format guard added to the two insert callbacks in `ProjectsPage.jsx` to catch misconfiguration early

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| **Create** | `supabase/migrations/20260805000001_project_id_text_pk.sql` | One-shot destructive DB migration |
| **Create** | `src/lib/projectCode.js` | `formatProjectCode(n)` + `isProjectCode(str)` |
| **Create** | `src/test/projectCode.test.js` | Unit tests for `projectCode.js` |
| **Modify** | `src/pages/ProjectsPage.jsx` | Add `isProjectCode` format guard to insert callbacks |

---

## Task 1: DB Migration SQL

**Files:**
- Create: `supabase/migrations/20260805000001_project_id_text_pk.sql`

> This is a **destructive migration** — dev data only. All rows in `projects` and every child table are wiped via CASCADE before schema changes. No data recovery needed or planned.

**Child tables that reference `projects(id)` via `project_id`** (confirmed from migrations + JS source):
`project_photos`, `project_scurve_baselines`, `scurve_baseline_data`, `scurve_actual`, `scurve_forecast`, `project_members`, `workprogram_tasks`, `workprogram_baselines`, `issues`, `project_permits`, `project_floors`, `project_unit_completion`, `project_buildings`, `project_parking_floors`, `project_parking_unit_completion`

Note: `workprogram_baseline_snapshots` only references `workprogram_baselines(id)` and `workprogram_tasks(id)` — it has **no direct project_id column** and needs no changes.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260805000001_project_id_text_pk.sql` with exactly this content:

```sql
-- ── 20260805000001_project_id_text_pk.sql ────────────────────────────────────
-- Converts projects.id from uuid to text in PRJ-000001 format.
-- A sequence + BEFORE INSERT trigger auto-assigns ids.
-- All child tables' project_id columns are changed from uuid to text.
-- DEV-ONLY: wipes all project data via CASCADE. Destructive.

-- ── 1. Wipe all data ──────────────────────────────────────────────────────────
TRUNCATE projects CASCADE;

-- ── 2. Drop FK constraints on all child tables ────────────────────────────────
-- Postgres auto-names inline FKs as <table>_<column>_fkey.
-- IF EXISTS handles any that were named differently via the Supabase UI.
ALTER TABLE project_photos                    DROP CONSTRAINT IF EXISTS project_photos_project_id_fkey;
ALTER TABLE project_scurve_baselines          DROP CONSTRAINT IF EXISTS project_scurve_baselines_project_id_fkey;
ALTER TABLE scurve_baseline_data              DROP CONSTRAINT IF EXISTS scurve_baseline_data_project_id_fkey;
ALTER TABLE scurve_actual                     DROP CONSTRAINT IF EXISTS scurve_actual_project_id_fkey;
ALTER TABLE scurve_forecast                   DROP CONSTRAINT IF EXISTS scurve_forecast_project_id_fkey;
ALTER TABLE project_members                   DROP CONSTRAINT IF EXISTS project_members_project_id_fkey;
ALTER TABLE workprogram_tasks                 DROP CONSTRAINT IF EXISTS workprogram_tasks_project_id_fkey;
ALTER TABLE workprogram_baselines             DROP CONSTRAINT IF EXISTS workprogram_baselines_project_id_fkey;
ALTER TABLE issues                            DROP CONSTRAINT IF EXISTS issues_project_id_fkey;
ALTER TABLE project_permits                   DROP CONSTRAINT IF EXISTS project_permits_project_id_fkey;
ALTER TABLE project_floors                    DROP CONSTRAINT IF EXISTS project_floors_project_id_fkey;
ALTER TABLE project_unit_completion           DROP CONSTRAINT IF EXISTS project_unit_completion_project_id_fkey;
ALTER TABLE project_buildings                 DROP CONSTRAINT IF EXISTS project_buildings_project_id_fkey;
ALTER TABLE project_parking_floors            DROP CONSTRAINT IF EXISTS project_parking_floors_project_id_fkey;
ALTER TABLE project_parking_unit_completion   DROP CONSTRAINT IF EXISTS project_parking_unit_completion_project_id_fkey;

-- ── 3. Change projects.id from uuid to text ───────────────────────────────────
-- Drop PK first (required before altering the PK column type).
ALTER TABLE projects DROP CONSTRAINT projects_pkey;

-- uuid has an implicit cast to text in Postgres; with zero rows this is trivial.
ALTER TABLE projects
  ALTER COLUMN id TYPE text,
  ALTER COLUMN id DROP DEFAULT;      -- removes gen_random_uuid(); trigger takes over

-- Restore PK.
ALTER TABLE projects ADD PRIMARY KEY (id);

-- Enforce the PRJ-XXXXXX pattern at the DB level.
ALTER TABLE projects
  ADD CONSTRAINT projects_id_format CHECK (id ~ '^PRJ-[0-9]{6}$');

-- ── 4. Sequence + auto-assign trigger ─────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS projects_code_seq START 1;

CREATE OR REPLACE FUNCTION assign_project_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := 'PRJ-' || lpad(nextval('projects_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_project_id ON projects;
CREATE TRIGGER trg_assign_project_id
  BEFORE INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION assign_project_id();

-- ── 5. Change project_id columns to text on all child tables ──────────────────
-- Implicit uuid::text cast; all rows were wiped in step 1, so trivially safe.
ALTER TABLE project_photos                    ALTER COLUMN project_id TYPE text;
ALTER TABLE project_scurve_baselines          ALTER COLUMN project_id TYPE text;
ALTER TABLE scurve_baseline_data              ALTER COLUMN project_id TYPE text;
ALTER TABLE scurve_actual                     ALTER COLUMN project_id TYPE text;
ALTER TABLE scurve_forecast                   ALTER COLUMN project_id TYPE text;
ALTER TABLE project_members                   ALTER COLUMN project_id TYPE text;
ALTER TABLE workprogram_tasks                 ALTER COLUMN project_id TYPE text;
ALTER TABLE workprogram_baselines             ALTER COLUMN project_id TYPE text;
ALTER TABLE issues                            ALTER COLUMN project_id TYPE text;
ALTER TABLE project_permits                   ALTER COLUMN project_id TYPE text;
ALTER TABLE project_floors                    ALTER COLUMN project_id TYPE text;
ALTER TABLE project_unit_completion           ALTER COLUMN project_id TYPE text;
ALTER TABLE project_buildings                 ALTER COLUMN project_id TYPE text;
ALTER TABLE project_parking_floors            ALTER COLUMN project_id TYPE text;
ALTER TABLE project_parking_unit_completion   ALTER COLUMN project_id TYPE text;

-- ── 6. Recreate FK constraints ────────────────────────────────────────────────
ALTER TABLE project_photos
  ADD CONSTRAINT project_photos_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_scurve_baselines
  ADD CONSTRAINT project_scurve_baselines_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE scurve_baseline_data
  ADD CONSTRAINT scurve_baseline_data_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE scurve_actual
  ADD CONSTRAINT scurve_actual_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE scurve_forecast
  ADD CONSTRAINT scurve_forecast_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_members
  ADD CONSTRAINT project_members_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE workprogram_tasks
  ADD CONSTRAINT workprogram_tasks_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE workprogram_baselines
  ADD CONSTRAINT workprogram_baselines_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE issues
  ADD CONSTRAINT issues_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_permits
  ADD CONSTRAINT project_permits_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_floors
  ADD CONSTRAINT project_floors_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_unit_completion
  ADD CONSTRAINT project_unit_completion_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_buildings
  ADD CONSTRAINT project_buildings_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_parking_floors
  ADD CONSTRAINT project_parking_floors_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_parking_unit_completion
  ADD CONSTRAINT project_parking_unit_completion_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
```

- [ ] **Step 2: Apply the migration via Supabase CLI**

```bash
npx supabase db push
```

Expected output ends with lines like:
```
Applying migration 20260805000001_project_id_text_pk.sql...
Migration applied successfully.
```

If you get `ERROR: constraint "projects_pkey" does not exist`, the PK was given a custom name. Run this in the Supabase SQL editor to find the real name:
```sql
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'projects' AND constraint_type = 'PRIMARY KEY';
```
Then replace `projects_pkey` in the migration with the actual name.

If a FK drop fails (constraint name mismatch), run:
```sql
SELECT tc.table_name, tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.table_constraints ccu
  ON rc.unique_constraint_name = ccu.constraint_name
WHERE ccu.table_name = 'projects'
  AND tc.table_schema = 'public';
```
Update the DROP CONSTRAINT names in the migration to match.

- [ ] **Step 3: Verify the schema change in Supabase SQL editor**

Run:
```sql
-- Should return 'text'
SELECT data_type FROM information_schema.columns
WHERE table_name = 'projects' AND column_name = 'id';

-- Should return the CHECK constraint
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'projects'::regclass AND contype = 'c';

-- Should return the trigger
SELECT tgname FROM pg_trigger WHERE tgrelid = 'projects'::regclass;

-- Should return 'text' for all rows
SELECT table_name, data_type
FROM information_schema.columns
WHERE column_name = 'project_id'
  AND table_name IN (
    'project_photos','project_scurve_baselines','scurve_baseline_data',
    'scurve_actual','scurve_forecast','project_members',
    'workprogram_tasks','workprogram_baselines','issues',
    'project_permits','project_floors','project_unit_completion',
    'project_buildings','project_parking_floors','project_parking_unit_completion'
  )
ORDER BY table_name;
```

Expected: `id` is `text`, CHECK constraint is `(id ~ '^PRJ-[0-9]{6}$')`, trigger `trg_assign_project_id` is listed, all 15 child columns show `text`.

- [ ] **Step 4: Commit the migration file**

```bash
git add supabase/migrations/20260805000001_project_id_text_pk.sql
git commit -m "feat: migrate projects.id from uuid to text PRJ-XXXXXX PK"
```

---

## Task 2: Code Generator Utility + Tests (TDD)

**Files:**
- Create: `src/lib/projectCode.js`
- Create: `src/test/projectCode.test.js`

The utility is not needed to make the app work — the trigger handles ID generation. Its value is: (a) tests provide a runnable spec of the format contract, (b) `isProjectCode` is used in Task 3 as a format guard on insert results.

- [ ] **Step 1: Write the failing tests**

Create `src/test/projectCode.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { formatProjectCode, isProjectCode } from '../lib/projectCode'

describe('formatProjectCode', () => {
  it('formats 1 as PRJ-000001', () => {
    expect(formatProjectCode(1)).toBe('PRJ-000001')
  })

  it('formats 42 as PRJ-000042', () => {
    expect(formatProjectCode(42)).toBe('PRJ-000042')
  })

  it('formats 999999 without extra padding', () => {
    expect(formatProjectCode(999999)).toBe('PRJ-999999')
  })

  it('throws for zero', () => {
    expect(() => formatProjectCode(0)).toThrow('positive integer')
  })

  it('throws for negative', () => {
    expect(() => formatProjectCode(-1)).toThrow('positive integer')
  })

  it('throws for a float', () => {
    expect(() => formatProjectCode(1.5)).toThrow('positive integer')
  })

  it('throws for a string', () => {
    expect(() => formatProjectCode('1')).toThrow('positive integer')
  })
})

describe('isProjectCode', () => {
  it('accepts PRJ-000001', () => {
    expect(isProjectCode('PRJ-000001')).toBe(true)
  })

  it('accepts PRJ-999999', () => {
    expect(isProjectCode('PRJ-999999')).toBe(true)
  })

  it('rejects a bare UUID', () => {
    expect(isProjectCode('550e8400-e29b-41d4-a716-446655440000')).toBe(false)
  })

  it('rejects too few digits', () => {
    expect(isProjectCode('PRJ-00001')).toBe(false)
  })

  it('rejects too many digits', () => {
    expect(isProjectCode('PRJ-0000001')).toBe(false)
  })

  it('rejects wrong prefix', () => {
    expect(isProjectCode('prj-000001')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isProjectCode('')).toBe(false)
  })

  it('rejects null', () => {
    expect(isProjectCode(null)).toBe(false)
  })

  it('rejects undefined', () => {
    expect(isProjectCode(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests — expect failure**

```bash
npm test -- src/test/projectCode.test.js
```

Expected output: `FAIL src/test/projectCode.test.js` with `Cannot find module '../lib/projectCode'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/projectCode.js`:

```js
/**
 * Formats a sequence number as a PRJ-XXXXXX code.
 *
 * @param {number} n - positive integer (e.g. 1 → 'PRJ-000001')
 * @returns {string}
 */
export function formatProjectCode(n) {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`formatProjectCode: n must be a positive integer, got ${JSON.stringify(n)}`)
  }
  return `PRJ-${String(n).padStart(6, '0')}`
}

/**
 * Returns true if str matches the PRJ-XXXXXX primary key format.
 *
 * @param {*} str
 * @returns {boolean}
 */
export function isProjectCode(str) {
  return typeof str === 'string' && /^PRJ-\d{6}$/.test(str)
}
```

- [ ] **Step 4: Run the tests — expect all green**

```bash
npm test -- src/test/projectCode.test.js
```

Expected output:
```
PASS src/test/projectCode.test.js
 formatProjectCode (7)
 isProjectCode (9)
```

- [ ] **Step 5: Run the full test suite — no regressions**

```bash
npm test
```

Expected: all tests pass with no failures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projectCode.js src/test/projectCode.test.js
git commit -m "feat: add projectCode utility with formatProjectCode and isProjectCode"
```

---

## Task 3: Update JS/React References

**Files:**
- Modify: `src/pages/ProjectsPage.jsx`

All 60+ occurrences of `project.id` and `project_id` in the codebase already treat the value as an opaque string — React keys, Supabase filter args, equality checks, sessionStorage suffixes, storage path prefixes. **None of those call sites need changes.**

The one meaningful update is adding a format guard to both insert callbacks in `ProjectsPage.jsx`. This catches misconfiguration (e.g., migration not applied, trigger missing) at the moment a project is first created, rather than silently propagating a bad ID through the rest of the app.

- [ ] **Step 1: Add the import to ProjectsPage.jsx**

In `src/pages/ProjectsPage.jsx`, find the existing imports at the top of the file:

```js
import { supabase } from '../lib/supabaseClient'
```

Add the `isProjectCode` import immediately after it:

```js
import { supabase } from '../lib/supabaseClient'
import { isProjectCode } from '../lib/projectCode'
```

- [ ] **Step 2: Add format guard in handleSubmit**

Find this block in `handleSubmit` (around line 186):

```js
    const { data: inserted, error } = await supabase.from('projects').insert(payload).select('id').single()

    setSubmitting(false)
    if (error) { showToast('Error: ' + error.message, 'error'); return }
```

Replace it with:

```js
    const { data: inserted, error } = await supabase.from('projects').insert(payload).select('id').single()

    setSubmitting(false)
    if (error) { showToast('Error: ' + error.message, 'error'); return }
    if (!inserted?.id || !isProjectCode(inserted.id)) {
      showToast('Unexpected project ID format returned from server. Check that the migration and trigger are applied.', 'error')
      return
    }
```

- [ ] **Step 3: Add the same guard in handleImport**

Find this block in `handleImport` (around line 261):

```js
        const { data: inserted, error } = await supabase.from('projects').insert(payload).select('id').single()
        if (error) {
          errors.push({ name: payload.name, reason: error.message })
        } else {
          added.push(payload.name)
```

Replace it with:

```js
        const { data: inserted, error } = await supabase.from('projects').insert(payload).select('id').single()
        if (error) {
          errors.push({ name: payload.name, reason: error.message })
        } else if (!inserted?.id || !isProjectCode(inserted.id)) {
          errors.push({ name: payload.name, reason: 'Server returned unexpected ID format. Check migration.' })
        } else {
          added.push(payload.name)
```

- [ ] **Step 4: Run the full test suite — no regressions**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ProjectsPage.jsx
git commit -m "feat: add PRJ-XXXXXX format guard to project insert callbacks"
```

---

## Task 4: Smoke Test

**No new files.** This task verifies the end-to-end behaviour in the running app.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Expected: server starts at `http://localhost:5173` with no console errors.

- [ ] **Step 2: Create a project via the UI**

1. Navigate to `/projects`.
2. Click **Add Project**.
3. Fill in at minimum: Name = `Smoke Test Project`, Phase = `Initiation`.
4. Click **Add Project**.

Expected: project appears in the list. No error toast.

- [ ] **Step 3: Verify the project ID format in Supabase**

In the Supabase SQL editor:

```sql
SELECT id, name FROM projects ORDER BY id;
```

Expected: rows like:

```
 id         | name
------------+--------------------
 PRJ-000001 | Smoke Test Project
```

- [ ] **Step 4: Verify child-table FK integrity**

```sql
-- workprogram_baselines, project_members, scurve_actual, etc.
-- Create a project member for the new project, then check:
SELECT pm.project_id, p.id AS projects_id
FROM project_members pm
JOIN projects p ON p.id = pm.project_id
LIMIT 5;
```

Expected: rows return successfully (FK join works, both columns are text `PRJ-XXXXXX`).

- [ ] **Step 5: Verify a second insert auto-increments**

1. Add a second project via the UI: Name = `Smoke Test 2`.
2. In the SQL editor: `SELECT id, name FROM projects ORDER BY id;`

Expected:
```
 PRJ-000001 | Smoke Test Project
 PRJ-000002 | Smoke Test 2
```

- [ ] **Step 6: Run the full test suite one final time**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit smoke-test confirmation** *(optional — only if you added a comment or minor cleanup during testing)*

```bash
git add -p   # stage only intentional changes
git commit -m "chore: confirm PRJ-XXXXXX PK smoke test passed"
```

---

## Spec Coverage Self-Check

| Requirement | Covered by |
|-------------|------------|
| `projects.id` changes from uuid to text | Task 1 migration |
| Format `PRJ-000001` (zero-padded 6 digits) | Task 1 `CHECK` constraint + trigger |
| `projects_code_seq` sequence | Task 1 step 1 |
| Trigger auto-assigns on INSERT if id is null | Task 1 step 1 |
| All FK columns `project_id uuid` → `text` | Task 1 step 5-6 (all 15 tables) |
| `workprogram_tasks` FK updated | Task 1 (explicitly listed) |
| `workprogram_baselines` FK updated | Task 1 (explicitly listed) |
| `project_members` FK updated | Task 1 (explicitly listed) |
| `scurve_baseline_data` FK updated | Task 1 (explicitly listed) |
| `generateProjectCode`/utility + tests | Task 2 |
| Tests in `src/test/projectCode.test.js` | Task 2 |
| Update JS/React insert call sites | Task 3 |
| DB migration file at specified path | Task 1 |
| Each task ends with git commit | Tasks 1–4 |
| Smoke test | Task 4 |
| Dev data OK to wipe | Task 1 `TRUNCATE ... CASCADE` |

## Possible Gotchas

**FK constraint name mismatches** — If any FK was created via the Supabase dashboard rather than a migration file, it may have an auto-generated name that differs from the `<table>_<column>_fkey` convention. The `IF EXISTS` guards make those drops silently succeed, but the FK will still exist and block the column type change. The troubleshooting query in Task 1 Step 2 finds them all.

**`project_scurve_baselines` has its own children** — `scurve_baseline_data` references `project_scurve_baselines(id)` via `baseline_id` (not `project_id`). Those inner FKs are unaffected because `project_scurve_baselines.id` stays uuid. Only the `project_id` column on `project_scurve_baselines` changes.

**Session storage / object storage paths** — Existing dev sessions will have stale sessionStorage keys (`gantt-drafts-<old-uuid>`). These are harmless orphans that will be ignored. Old Supabase Storage objects under `<old-uuid>/cover.*` paths will be inaccessible after the migration wipes the projects table — that's expected and acceptable for dev data.

**Sequence vs. existing data** — The migration starts the sequence at 1. If the migration is run a second time on a DB that already has `PRJ-000001` rows, the `TRUNCATE` wipes them first, so there's no conflict. Never run this migration on production.
