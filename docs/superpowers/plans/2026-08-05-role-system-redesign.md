# Role System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the split HO/site role system with unified roles (admin/head/reviewer/endorser/reporter/viewer) plus a team field (ho/site) on profiles.

**Architecture:** profiles.role stores the role, profiles.team stores ho or site. project_members keeps project assignments but loses its own role column. All role checks in the app use the new role + team values.

**Tech Stack:** React 19, Supabase (PostgreSQL + supabase-js v2), Vitest

---

## File Map

| File | Change |
|---|---|
| `supabase/migrations/20260805000002_role_system_redesign.sql` | New — DB migration |
| `src/lib/roles.js` | New — role constants and helper functions |
| `src/test/roles.test.js` | New — unit tests for role utilities |
| `src/components/Sidebar.jsx` | Update NAV, ROLE_LABELS, ROLE_BADGE for new roles |
| `src/pages/Dashboard.jsx` | Update DESTINATIONS map |
| `src/App.jsx` | Update route paths and ProtectedRoute role arrays; rename dashboard imports |
| `src/components/ProtectedRoute.jsx` | Select `team` alongside `role` from profiles |
| `src/pages/admin/UserManagement.jsx` | New role constants; team-based filtering; remove project_members.role |
| `src/pages/admin/RoleAssignment.jsx` | Update ROLES list and labels |
| `src/pages/dashboards/ApproverDashboard.jsx` | Rename file to HODashboard.jsx |
| `src/pages/dashboards/UpdaterDashboard.jsx` | Rename file to ReporterDashboard.jsx |
| `src/components/ProjectDetailModal.jsx` | Change `role === 'updater'` → `role === 'reporter'` |

---

## Dashboard Route Map (old → new)

| Old path | New path | Component | Allowed roles |
|---|---|---|---|
| `/admin/dashboard` | `/admin/dashboard` | AdminDashboard | `['admin']` |
| `/approver/dashboard` | `/ho/dashboard` | HODashboard | `['head', 'reviewer']` |
| `/updater/dashboard` | `/reporter/dashboard` | ReporterDashboard | `['endorser', 'reporter']` |
| `/viewer/dashboard` | `/viewer/dashboard` | ViewerDashboard | `['viewer']` |

---

## Task 1 — DB Migration

**Files:** `supabase/migrations/20260805000002_role_system_redesign.sql`

### Steps

- [ ] Create the migration file with the SQL below.
- [ ] Run `npx supabase db push` (or `supabase migration up`) to apply it to dev.
- [ ] Verify in Supabase Studio that `profiles.team` column exists, all rows have a non-null team, and `project_members.role` column is gone.

```sql
-- supabase/migrations/20260805000002_role_system_redesign.sql

-- 1. Add team column
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS team TEXT;

-- 2. Backfill team based on old role values
UPDATE profiles SET team = CASE
  WHEN role IN ('admin', 'head', 'reviewer', 'approver', 'updater', 'viewer_ho', 'viewer') THEN 'ho'
  WHEN role IN ('cm', 'reporter', 'viewer_site')                                            THEN 'site'
  -- Users with NULL role had no global role (site users pre-migration)
  ELSE 'site'
END;

-- 3. Migrate role values
UPDATE profiles SET role = CASE
  WHEN role = 'approver'    THEN 'reviewer'
  WHEN role = 'updater'     THEN 'reporter'
  WHEN role = 'viewer_ho'   THEN 'viewer'
  WHEN role = 'cm'          THEN 'endorser'
  WHEN role = 'viewer_site' THEN 'viewer'
  -- admin, head, reviewer, reporter, viewer already match
  ELSE role
END;

-- 4. Add NOT NULL constraint and check constraint on team
ALTER TABLE profiles
  ALTER COLUMN team SET NOT NULL,
  ADD CONSTRAINT profiles_team_check CHECK (team IN ('ho', 'site'));

-- 5. Add check constraint on role (new allowed values only)
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'head', 'reviewer', 'endorser', 'reporter', 'viewer'));

-- 6. Drop project_members.role column (role is now on profiles)
ALTER TABLE project_members
  DROP COLUMN IF EXISTS role;
```

**Commit:** `git commit -m "db: add profiles.team column and migrate to new role system"`

---

## Task 2 — Role Utility + Tests (TDD)

**Files:** `src/test/roles.test.js` (write first), `src/lib/roles.js`

### Steps

- [ ] Write `src/test/roles.test.js` (test file first, before implementation).
- [ ] Run `npm test` — all role tests should fail (red).
- [ ] Write `src/lib/roles.js` to make them pass (green).
- [ ] Run `npm test` again to confirm green.

#### `src/test/roles.test.js`

```js
import { describe, it, expect } from 'vitest'
import {
  ROLES,
  TEAMS,
  ROLE_LABELS,
  ROLE_COLORS,
  ROLE_BADGE,
  isHO,
  isSite,
  isAdmin,
  canEdit,
  canEndorse,
  navKeyForProfile,
} from '../lib/roles'

describe('ROLES / TEAMS constants', () => {
  it('exports the six canonical roles', () => {
    expect(ROLES).toEqual(['admin', 'head', 'reviewer', 'endorser', 'reporter', 'viewer'])
  })
  it('exports the two canonical teams', () => {
    expect(TEAMS).toEqual(['ho', 'site'])
  })
})

describe('ROLE_LABELS', () => {
  it('has a label for every role', () => {
    ROLES.forEach(r => expect(ROLE_LABELS[r]).toBeTruthy())
  })
})

describe('ROLE_COLORS / ROLE_BADGE', () => {
  it('has a color and badge for every role', () => {
    ROLES.forEach(r => {
      expect(ROLE_COLORS[r]).toBeTruthy()
      expect(ROLE_BADGE[r]).toBeTruthy()
    })
  })
})

describe('isHO(profile)', () => {
  it('returns true for ho team', () => {
    expect(isHO({ role: 'admin',    team: 'ho' })).toBe(true)
    expect(isHO({ role: 'head',     team: 'ho' })).toBe(true)
    expect(isHO({ role: 'reviewer', team: 'ho' })).toBe(true)
    expect(isHO({ role: 'reporter', team: 'ho' })).toBe(true)
    expect(isHO({ role: 'viewer',   team: 'ho' })).toBe(true)
  })
  it('returns false for site team', () => {
    expect(isHO({ role: 'endorser', team: 'site' })).toBe(false)
    expect(isHO({ role: 'reporter', team: 'site' })).toBe(false)
    expect(isHO({ role: 'viewer',   team: 'site' })).toBe(false)
  })
  it('returns false for null/undefined profile', () => {
    expect(isHO(null)).toBe(false)
    expect(isHO(undefined)).toBe(false)
  })
})

describe('isSite(profile)', () => {
  it('returns true for site team', () => {
    expect(isSite({ role: 'endorser', team: 'site' })).toBe(true)
    expect(isSite({ role: 'reporter', team: 'site' })).toBe(true)
    expect(isSite({ role: 'viewer',   team: 'site' })).toBe(true)
  })
  it('returns false for ho team', () => {
    expect(isSite({ role: 'admin', team: 'ho' })).toBe(false)
  })
})

describe('isAdmin(profile)', () => {
  it('returns true only for admin role', () => {
    expect(isAdmin({ role: 'admin', team: 'ho' })).toBe(true)
    expect(isAdmin({ role: 'head',  team: 'ho' })).toBe(false)
    expect(isAdmin(null)).toBe(false)
  })
})

describe('canEdit(profile)', () => {
  it('returns true for admin, reporter roles', () => {
    expect(canEdit({ role: 'admin',    team: 'ho'   })).toBe(true)
    expect(canEdit({ role: 'reporter', team: 'ho'   })).toBe(true)
    expect(canEdit({ role: 'reporter', team: 'site' })).toBe(true)
  })
  it('returns false for viewer, endorser, head, reviewer', () => {
    expect(canEdit({ role: 'viewer',   team: 'ho'   })).toBe(false)
    expect(canEdit({ role: 'endorser', team: 'site' })).toBe(false)
    expect(canEdit({ role: 'head',     team: 'ho'   })).toBe(false)
    expect(canEdit({ role: 'reviewer', team: 'ho'   })).toBe(false)
  })
  it('returns false for null', () => {
    expect(canEdit(null)).toBe(false)
  })
})

describe('canEndorse(profile)', () => {
  it('returns true for endorser', () => {
    expect(canEndorse({ role: 'endorser', team: 'site' })).toBe(true)
  })
  it('returns false for other roles', () => {
    expect(canEndorse({ role: 'reporter', team: 'site' })).toBe(false)
    expect(canEndorse({ role: 'admin',    team: 'ho'   })).toBe(false)
    expect(canEndorse(null)).toBe(false)
  })
})

describe('navKeyForProfile(profile)', () => {
  it('returns the NAV key matching the role for sidebar lookup', () => {
    expect(navKeyForProfile({ role: 'admin',    team: 'ho'   })).toBe('admin')
    expect(navKeyForProfile({ role: 'head',     team: 'ho'   })).toBe('ho')
    expect(navKeyForProfile({ role: 'reviewer', team: 'ho'   })).toBe('ho')
    expect(navKeyForProfile({ role: 'endorser', team: 'site' })).toBe('reporter')
    expect(navKeyForProfile({ role: 'reporter', team: 'ho'   })).toBe('reporter')
    expect(navKeyForProfile({ role: 'reporter', team: 'site' })).toBe('reporter')
    expect(navKeyForProfile({ role: 'viewer',   team: 'ho'   })).toBe('viewer')
    expect(navKeyForProfile({ role: 'viewer',   team: 'site' })).toBe('viewer')
    expect(navKeyForProfile(null)).toBe('viewer')
  })
})
```

#### `src/lib/roles.js`

```js
// ── Canonical role and team values ─────────────────────────────────────────
export const ROLES = ['admin', 'head', 'reviewer', 'endorser', 'reporter', 'viewer']
export const TEAMS = ['ho', 'site']

// ── Display labels ─────────────────────────────────────────────────────────
export const ROLE_LABELS = {
  admin:    'Admin',
  head:     'Head',
  reviewer: 'Reviewer',
  endorser: 'Endorser',
  reporter: 'Reporter',
  viewer:   'Viewer',
}

// ── Tailwind classes for inline badges (dark backgrounds in lists) ──────────
export const ROLE_COLORS = {
  admin:    'bg-black text-white',
  head:     'bg-purple-600 text-white',
  reviewer: 'bg-amber-500 text-white',
  endorser: 'bg-emerald-600 text-white',
  reporter: 'bg-sky-600 text-white',
  viewer:   'bg-gray-500 text-white',
}

// ── Tailwind classes for sidebar badge (dark sidebar background) ───────────
export const ROLE_BADGE = {
  admin:    'bg-white text-black',
  head:     'bg-purple-500 text-white',
  reviewer: 'bg-amber-500 text-white',
  endorser: 'bg-emerald-500 text-white',
  reporter: 'bg-sky-500 text-white',
  viewer:   'bg-gray-500 text-white',
}

// ── Helper functions ───────────────────────────────────────────────────────
/** True if profile belongs to Head Office team */
export const isHO   = (profile) => profile?.team === 'ho'

/** True if profile belongs to Site team */
export const isSite = (profile) => profile?.team === 'site'

/** True if profile has the admin role */
export const isAdmin = (profile) => profile?.role === 'admin'

/**
 * True if the user can enter/edit data (reporter or admin).
 * Reviewers and heads read but do not enter data.
 */
export const canEdit = (profile) =>
  profile?.role === 'admin' || profile?.role === 'reporter'

/**
 * True if the user can endorse site reporter inputs
 * before they reach HO reviewers.
 */
export const canEndorse = (profile) => profile?.role === 'endorser'

/**
 * Returns the NAV key used by Sidebar.jsx to look up nav items.
 * Collapses head/reviewer → 'ho', endorser/reporter → 'reporter'.
 */
export const navKeyForProfile = (profile) => {
  const role = profile?.role
  if (role === 'admin')                        return 'admin'
  if (role === 'head' || role === 'reviewer')  return 'ho'
  if (role === 'endorser' || role === 'reporter') return 'reporter'
  return 'viewer' // viewer (ho or site) and undefined
}
```

**Commit:** `git commit -m "feat: add role utility constants and helpers with full test coverage"`

---

## Task 3 — Update Sidebar Nav

**File:** `src/components/Sidebar.jsx`

### Steps

- [ ] Import `ROLE_LABELS`, `ROLE_BADGE`, `navKeyForProfile` from `../lib/roles`.
- [ ] Replace the `NAV` object with entries for the four nav keys: `admin`, `ho`, `reporter`, `viewer`.
- [ ] Replace the `ROLE_LABELS` and `ROLE_BADGE` local constants with the imported ones.
- [ ] Change `const items = NAV[profile?.role] ?? []` to use `navKeyForProfile`.

#### Replacement for `NAV`, `ROLE_LABELS`, `ROLE_BADGE`, and items lookup

```jsx
// ── Replace the import block at the top ───────────────────────────────────
import { ROLE_LABELS, ROLE_BADGE, navKeyForProfile } from '../lib/roles'

// ── Replace the NAV constant ──────────────────────────────────────────────
const NAV = {
  admin: [
    { label: 'Dashboard',             path: '/admin/dashboard',              Icon: HomeIcon },
    { label: 'Projects',              path: '/projects',                     Icon: FolderIcon },
    { label: 'Standard Permits',      path: '/admin/standard-permits',       Icon: DocumentCheckIcon },
    { label: 'Role Assignment',       path: '/admin/roles',                  Icon: ShieldIcon },
    { label: 'Work Program Template', path: '/admin/work-program-template',  Icon: TemplateIcon },
  ],
  ho: [
    { label: 'Dashboard', path: '/ho/dashboard', Icon: HomeIcon },
    { label: 'Projects',  path: '/projects',     Icon: FolderIcon },
  ],
  reporter: [
    { label: 'Dashboard', path: '/reporter/dashboard', Icon: HomeIcon },
    { label: 'Projects',  path: '/projects',           Icon: FolderIcon },
  ],
  viewer: [
    { label: 'Dashboard', path: '/viewer/dashboard', Icon: HomeIcon },
    { label: 'Projects',  path: '/projects',         Icon: FolderIcon },
  ],
}

// ── Replace items lookup inside the component ─────────────────────────────
const items = NAV[navKeyForProfile(profile)] ?? []

// ── In the footer badge, replace local constants with imported ones ────────
// (ROLE_LABELS and ROLE_BADGE are now imported — delete the old local constants)
```

**Commit:** `git commit -m "feat: update Sidebar nav for new role system (admin/ho/reporter/viewer keys)"`

---

## Task 4 — Update ProtectedRoute, Dashboard, and App.jsx

**Files:** `src/components/ProtectedRoute.jsx`, `src/pages/Dashboard.jsx`, `src/App.jsx`, `src/pages/dashboards/ApproverDashboard.jsx` → rename to `HODashboard.jsx`, `src/pages/dashboards/UpdaterDashboard.jsx` → rename to `ReporterDashboard.jsx`

### Steps

- [ ] Rename `ApproverDashboard.jsx` → `HODashboard.jsx` (copy file, update component name to `HODashboard`).
- [ ] Rename `UpdaterDashboard.jsx` → `ReporterDashboard.jsx` (copy file, update component name to `ReporterDashboard`).
- [ ] Update `ProtectedRoute.jsx` to also select `team` from profiles.
- [ ] Update `Dashboard.jsx` DESTINATIONS with the new role → path mapping.
- [ ] Update `App.jsx` imports and routes.

#### `src/components/ProtectedRoute.jsx` — select team too

```js
// Change this select call (line ~38):
const { data: profile } = await supabase
  .from('profiles')
  .select('role, team, is_active')   // add team
  .eq('id', session.user.id)
  .single()
```

#### `src/pages/Dashboard.jsx` — new DESTINATIONS

```js
const DESTINATIONS = {
  admin:    '/admin/dashboard',
  head:     '/ho/dashboard',
  reviewer: '/ho/dashboard',
  endorser: '/reporter/dashboard',
  reporter: '/reporter/dashboard',
  viewer:   '/viewer/dashboard',
}
```

#### `src/App.jsx` — updated imports and routes

```jsx
// Replace old dashboard imports:
import HODashboard       from './pages/dashboards/HODashboard'
import ReporterDashboard from './pages/dashboards/ReporterDashboard'
// Keep:
import AdminDashboard  from './pages/dashboards/AdminDashboard'
import ViewerDashboard from './pages/dashboards/ViewerDashboard'
// Remove:
// import ApproverDashboard from './pages/dashboards/ApproverDashboard'
// import UpdaterDashboard  from './pages/dashboards/UpdaterDashboard'

// Replace the four role-dashboard route definitions:
<Route path="/admin/dashboard"    element={<ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>} />
<Route path="/ho/dashboard"       element={<ProtectedRoute roles={['head', 'reviewer']}><HODashboard /></ProtectedRoute>} />
<Route path="/reporter/dashboard" element={<ProtectedRoute roles={['endorser', 'reporter']}><ReporterDashboard /></ProtectedRoute>} />
<Route path="/viewer/dashboard"   element={<ProtectedRoute roles={['viewer']}><ViewerDashboard /></ProtectedRoute>} />
```

**Commit:** `git commit -m "feat: update routing and ProtectedRoute for new role/team system"`

---

## Task 5 — Update UserManagement.jsx

**File:** `src/pages/admin/UserManagement.jsx`

The largest change. The page currently:
- Distinguishes HO vs site users by `u.role !== null` — must switch to `u.team === 'ho'` / `u.team === 'site'`.
- Selects `project_members.role` (column being dropped) — remove from select.
- Inserts `project_members.role` on add-member — remove from insert.
- Shows `m.role` badge on membership rows — remove (role is no longer on members).
- Has `addRole` state for the site role dropdown — remove entirely.
- Has `HO_ROLES` and `SITE_ROLES` local arrays — replace with imported constants.

### Steps

- [ ] Add import of `ROLES`, `ROLE_LABELS`, `ROLE_COLORS` from `../../lib/roles`.
- [ ] Replace `HO_ROLES` and `SITE_ROLES` constants with imported `ROLES`.
- [ ] Update `ROLE_COLORS` to use the imported value.
- [ ] Update `fetchAll`: remove `role` from `project_members.select(...)`.
- [ ] Update `filtered` logic: replace `u.role !== null` / `u.role === null` with `u.team === 'ho'` / `u.team === 'site'`.
- [ ] Update filter tab counts to use `u.team`.
- [ ] Update `profiles.select(...)` to include `team`.
- [ ] Remove `addRole` state and the site-role `<select>` from the "Add to project" UI.
- [ ] Update `addMember`: remove `role: addRole` from the insert payload; remove `role` from the `.select()` on the returning row.
- [ ] Remove `RoleBadge role={m.role}` from project membership list rows.
- [ ] Update the HO/site section divider: use `selectedUser.team === 'ho'` instead of `selectedUser.role !== null`.
- [ ] In the HO role `<select>`, populate options from `ROLES` (or a filtered HO subset).
- [ ] Update `updateRole` to also write `team` when needed (admin sets both role and team together).

#### Key diff sections

```jsx
// 1. New imports (replace local constants)
import { ROLES, ROLE_LABELS, ROLE_COLORS } from '../../lib/roles'

// 2. Remove HO_ROLES, SITE_ROLES, local ROLE_COLORS — now imported.

// 3. fetchAll — profiles select: add team
supabase
  .from('profiles')
  .select('id, email, full_name, role, team, is_active, created_at, avatar_url, position')
  .order('full_name', { ascending: true }),

// 4. fetchAll — project_members: remove role from select
supabase
  .from('project_members')
  .select('id, project_id, user_id'),   // no role

// 5. Filtered logic
const filtered = users.filter(u => {
  const q = search.toLowerCase()
  const matchSearch =
    (u.full_name ?? '').toLowerCase().includes(q) ||
    (u.email ?? '').toLowerCase().includes(q)
  const matchTab =
    filterTab === 'all'  ? true :
    filterTab === 'ho'   ? u.team === 'ho' :
    filterTab === 'site' ? u.team === 'site' : true
  return matchSearch && matchTab
})

// 6. Filter strip tab counts
{ key: 'ho',   label: 'HO Users',   count: users.filter(u => u.team === 'ho').length },
{ key: 'site', label: 'Site Users',  count: users.filter(u => u.team === 'site').length },

// 7. Remove addRole state and reset in selectUser
const selectUser = (user) => {
  setSelectedUser(user)
  setPositionDraft(user.position ?? '')
  setAddProjectId('')
  // REMOVE: setAddRole('cm')
}

// 8. addMember: no role in insert
const { data, error } = await supabase
  .from('project_members')
  .insert({ project_id: addProjectId, user_id: selectedUser.id })  // no role
  .select('id, project_id, user_id')
  .single()

// 9. Role section switch — use team instead of role !== null
{selectedUser.team === 'ho' ? (
  /* HO user — show role dropdown */
  <>
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Role</label>
    <div className="flex items-center gap-3">
      <select
        value={selectedUser.role ?? ''}
        onChange={e => updateRole(e.target.value)}
        disabled={savingRole}
        className="text-sm border border-gray-200 rounded-lg px-3 py-2.5 text-black bg-white
                   focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent
                   disabled:opacity-50 transition"
      >
        {ROLES.map(r => (
          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
        ))}
      </select>
      {savingRole && (
        <span className="w-4 h-4 border-2 border-[#ed6055] border-t-transparent rounded-full animate-spin flex-shrink-0" />
      )}
      <RoleBadge role={selectedUser.role} />
    </div>
  </>
) : (
  /* Site user — show role dropdown + project assignments */
  <>
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Site User</span>
      <RoleBadge role={selectedUser.role} />
    </div>
    <div className="flex items-center gap-3 mb-4">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</label>
      <select
        value={selectedUser.role ?? ''}
        onChange={e => updateRole(e.target.value)}
        disabled={savingRole}
        className="text-sm border border-gray-200 rounded-lg px-3 py-2.5 text-black bg-white
                   focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent
                   disabled:opacity-50 transition"
      >
        {/* Site roles only */}
        {['endorser', 'reporter', 'viewer'].map(r => (
          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
        ))}
      </select>
      {savingRole && (
        <span className="w-4 h-4 border-2 border-[#ed6055] border-t-transparent rounded-full animate-spin flex-shrink-0" />
      )}
    </div>

    {/* Project assignments */}
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Project Assignments</p>
      {userMemberships(selectedUser.id).length === 0 ? (
        <p className="text-sm text-gray-400 italic mb-3">No project assignments yet.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {userMemberships(selectedUser.id).map(m => (
            <div key={m.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2.5 border border-gray-100">
              <span className="flex-1 text-sm text-black font-medium truncate">
                {projectName(m.project_id)}
              </span>
              {/* Role badge removed — role is now on profiles, not members */}
              <button
                onClick={() => removeMember(m.id)}
                disabled={removingMemberId === m.id}
                className="flex-shrink-0 p-1 rounded-md text-gray-400 hover:text-[#ed6055] hover:bg-[#ed6055]/5 transition disabled:opacity-40"
                title="Remove assignment"
              >
                {removingMemberId === m.id ? (
                  <span className="w-3.5 h-3.5 border-2 border-[#ed6055] border-t-transparent rounded-full animate-spin block" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add to project — role dropdown removed */}
      {avail.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <select
            value={addProjectId}
            onChange={e => setAddProjectId(e.target.value)}
            disabled={addingMember}
            className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-3 py-2 text-black bg-white
                       focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent
                       disabled:opacity-50 transition"
          >
            <option value="" disabled>Select project…</option>
            {avail.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={addMember}
            disabled={!addProjectId || addingMember}
            className="px-4 py-2 rounded-lg bg-black text-white text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-40 whitespace-nowrap flex items-center gap-2"
          >
            {addingMember ? (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            )}
            Add
          </button>
        </div>
      )}
    </div>
  </>
)}
```

**Commit:** `git commit -m "feat: update UserManagement for new role/team system — remove project_members.role"`

---

## Task 6 — Update Remaining Role Checks

**Files:** `src/pages/admin/RoleAssignment.jsx`, `src/components/ProjectDetailModal.jsx`

### Steps

#### RoleAssignment.jsx

- [ ] Replace the `ROLES`, `ROLE_LABELS`, `ROLE_COLORS`, `ROLE_ACCENT` local constants with imports from `../../lib/roles`.
- [ ] Update `ROLE_ACCENT` for new roles (only used locally for filter pill highlighting — keep as local constant).
- [ ] Update `profiles.select(...)` to include `team`.

```jsx
// Replace local ROLES, ROLE_LABELS, ROLE_COLORS with imports:
import { ROLES, ROLE_LABELS, ROLE_COLORS } from '../../lib/roles'

// Keep ROLE_ACCENT as local (UI-only highlight color):
const ROLE_ACCENT = {
  admin:    '#111111',
  head:     '#7c3aed',
  reviewer: '#f59e0b',
  endorser: '#059669',
  reporter: '#0284c7',
  viewer:   '#6b7280',
}

// Update profiles select to include team:
supabase
  .from('profiles')
  .select('id, email, full_name, role, team, is_active, created_at')
  .order('created_at', { ascending: false })
```

#### ProjectDetailModal.jsx (line ~4704)

- [ ] Change `role === 'updater'` to `role === 'reporter'`.

```jsx
// Old:
{tab === 'S-Curve' && <SCurveTab project={project} isAdmin={isAdmin} canEdit={isAdmin || profile?.role === 'updater'} />}

// New:
{tab === 'S-Curve' && <SCurveTab project={project} isAdmin={isAdmin} canEdit={isAdmin || profile?.role === 'reporter'} />}
```

**Commit:** `git commit -m "feat: update RoleAssignment and ProjectDetailModal for new role system"`

---

## Checklist Summary

- [ ] Task 1 — DB migration written and applied
- [ ] Task 2 — `src/lib/roles.js` created; `src/test/roles.test.js` written and passing
- [ ] Task 3 — `Sidebar.jsx` nav updated
- [ ] Task 4 — `ProtectedRoute.jsx`, `Dashboard.jsx`, `App.jsx` updated; dashboard files renamed
- [ ] Task 5 — `UserManagement.jsx` updated (team-based filtering, no project_members.role)
- [ ] Task 6 — `RoleAssignment.jsx` and `ProjectDetailModal.jsx` updated

## Verification

After all tasks:

1. Run `npm test` — all tests pass.
2. Sign in as each role type and confirm the correct dashboard and nav items appear.
3. In UserManagement, confirm HO/Site filter tabs use `team`, not null-role heuristic.
4. Confirm adding a project member no longer offers a role dropdown.
5. Confirm project membership rows no longer show a role badge.
6. Confirm `profiles.role` in Supabase Studio only contains new values.
7. Confirm `project_members` table has no `role` column.
