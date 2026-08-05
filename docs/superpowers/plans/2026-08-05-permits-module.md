# Permits Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Permits Monitoring module — dashboard, per-permit detail, project integration, in-app + email + MS Teams notifications.

**Architecture:** Four new DB tables (permits, permit_requirements, permit_issues, notifications). PRMT-000001 text PK via sequence trigger. HO-only access. Notifications via Supabase realtime (in-app), Resend (email), Teams webhook (configurable).

**Tech Stack:** React 19, Supabase (PostgreSQL + supabase-js v2), Tailwind CSS v3, Vitest

---

## Important Context

The project already has a `project_permits` table and `ComplianceTab` inside `ProjectDetailModal.jsx` — that is the per-project compliance checklist (standard permits tree). The new `permits` module is a **separate, schedulable layer**: named permit records with planned/forecast/actual date ranges, checklists, issue tracking, and overdue detection. The existing Permits tab in the project modal will be **replaced** by the new `PermitsTab` component that drives data from the new `permits` table.

---

## File Map

| File | Change |
|---|---|
| `supabase/migrations/20260805000004_permits_module.sql` | New — four tables, sequence trigger, RLS, app_settings row |
| `src/lib/permitUtils.js` | New — `formatPermitId`, `computePermitStatus`, `isOverdue` helpers |
| `src/test/permitUtils.test.js` | New — unit tests for permit utilities |
| `src/lib/notifications.js` | New — `sendIssueNotification` (Resend), `sendTeamsNotification` (webhook) |
| `src/test/notifications.test.js` | New — unit tests for notification helpers |
| `src/pages/admin/PermitsDashboard.jsx` | New — `/admin/permits` route |
| `src/components/PermitDetail.jsx` | New — permit drawer/modal (dates, checklist, issues) |
| `src/components/PermitsTab.jsx` | New — replaces ComplianceTab for the Permits tab in ProjectDetailModal |
| `src/components/NotificationBell.jsx` | New — bell icon with badge, dropdown, realtime subscription |
| `src/components/ProjectDetailModal.jsx` | Replace `ComplianceTab` import with `PermitsTab` |
| `src/components/Sidebar.jsx` | Add "Permits Monitoring" section (HO users only) |
| `src/App.jsx` | Add `/admin/permits` route |
| `src/components/DashboardLayout.jsx` | Mount `NotificationBell` in the top bar |

---

## Task 1 — DB Migration + Permit Code Utility

**Files:** `supabase/migrations/20260805000004_permits_module.sql`, `src/lib/permitUtils.js`, `src/test/permitUtils.test.js`

### Steps

- [ ] Create the migration file with the SQL below.
- [ ] Create `src/lib/permitUtils.js` with the helper functions below.
- [ ] Create `src/test/permitUtils.test.js` with the tests below.
- [ ] Run `npm test` — all permit utility tests must pass before continuing.
- [ ] Run `npx supabase db push` (or apply via Supabase Studio) to apply the migration.
- [ ] Verify in Supabase Studio: `permits`, `permit_requirements`, `permit_issues`, `notifications`, and `app_settings` tables exist; inserting a permit row auto-generates a `PRMT-000001`-style id.

```sql
-- supabase/migrations/20260805000004_permits_module.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SEQUENCE + TRIGGER for PRMT-000001 text PK
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS permits_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_permit_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := 'PRMT-' || LPAD(nextval('permits_id_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. permits
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permits (
  id                  text PRIMARY KEY DEFAULT '',
  project_id          text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name                text NOT NULL,
  responsible_person  text,
  planned_start       date,
  planned_finish      date,
  forecast_start      date,
  forecast_finish     date,
  actual_start        date,
  actual_finish       date,
  remaining_duration  numeric,
  status              text CHECK (status IN ('pending','in-progress','acquired','overdue')),
  remarks             text,
  created_by          uuid REFERENCES auth.users,
  created_at          timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS set_permit_id ON permits;
CREATE TRIGGER set_permit_id
  BEFORE INSERT ON permits
  FOR EACH ROW EXECUTE FUNCTION generate_permit_id();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. permit_requirements
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permit_requirements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id    text NOT NULL REFERENCES permits(id) ON DELETE CASCADE,
  description  text NOT NULL,
  is_complete  boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. permit_issues
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permit_issues (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id    text NOT NULL REFERENCES permits(id) ON DELETE CASCADE,
  issue        text NOT NULL,
  description  text,
  raised_by    uuid REFERENCES auth.users,
  assigned_to  uuid REFERENCES auth.users,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolved_at  timestamptz,
  created_at   timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. notifications
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  type       text,
  payload    jsonb,
  read_at    timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. app_settings (key-value store for admin config like Teams webhook)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz DEFAULT now()
);

-- Seed the Teams webhook key so it's discoverable even before configuration
INSERT INTO app_settings (key, value)
VALUES ('teams_webhook_url', '')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS permits_project_id_idx       ON permits(project_id);
CREATE INDEX IF NOT EXISTS permits_status_idx           ON permits(status);
CREATE INDEX IF NOT EXISTS permit_requirements_permit_idx ON permit_requirements(permit_id);
CREATE INDEX IF NOT EXISTS permit_issues_permit_idx     ON permit_issues(permit_id);
CREATE INDEX IF NOT EXISTS permit_issues_assigned_idx   ON permit_issues(assigned_to);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_read_at_idx    ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE permits                ENABLE ROW LEVEL SECURITY;
ALTER TABLE permit_requirements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE permit_issues          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings           ENABLE ROW LEVEL SECURITY;

-- Helper: is the calling user an HO user (team = 'ho')?
-- (profiles.team column added by Plan D / role-system-redesign migration)
CREATE OR REPLACE FUNCTION is_ho_user()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT team = 'ho' FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION has_role(r text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT role = r FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION has_any_role(roles text[])
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT role = ANY(roles) FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- permits: HO users can SELECT. Admin only for INSERT/UPDATE/DELETE.
CREATE POLICY permits_select   ON permits FOR SELECT USING (is_ho_user());
CREATE POLICY permits_insert   ON permits FOR INSERT WITH CHECK (has_role('admin'));
CREATE POLICY permits_update   ON permits FOR UPDATE USING (has_role('admin'));
CREATE POLICY permits_delete   ON permits FOR DELETE USING (has_role('admin'));

-- permit_requirements: HO users SELECT. Admin/head INSERT/UPDATE/DELETE.
CREATE POLICY preq_select ON permit_requirements FOR SELECT USING (is_ho_user());
CREATE POLICY preq_insert ON permit_requirements FOR INSERT WITH CHECK (has_any_role(ARRAY['admin','head']));
CREATE POLICY preq_update ON permit_requirements FOR UPDATE USING (has_any_role(ARRAY['admin','head']));
CREATE POLICY preq_delete ON permit_requirements FOR DELETE USING (has_any_role(ARRAY['admin','head']));

-- permit_issues: HO users SELECT and INSERT. Admin/head UPDATE (resolve).
CREATE POLICY pissue_select ON permit_issues FOR SELECT USING (is_ho_user());
CREATE POLICY pissue_insert ON permit_issues FOR INSERT WITH CHECK (is_ho_user());
CREATE POLICY pissue_update ON permit_issues FOR UPDATE USING (has_any_role(ARRAY['admin','head']));

-- notifications: users see and update only their own rows.
CREATE POLICY notif_select ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY notif_update ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY notif_insert ON notifications FOR INSERT WITH CHECK (true); -- server/edge inserts

-- app_settings: admin can manage; HO users can read (for webhook presence detection).
CREATE POLICY appsettings_select ON app_settings FOR SELECT USING (is_ho_user());
CREATE POLICY appsettings_update ON app_settings FOR UPDATE USING (has_role('admin'));
CREATE POLICY appsettings_insert ON app_settings FOR INSERT WITH CHECK (has_role('admin'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Realtime — enable publications for in-app notifications
-- ─────────────────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE permit_issues;
```

```js
// src/lib/permitUtils.js

/**
 * Format a raw permit id number to PRMT-000001 style.
 * Accepts a number or a string. Returns the formatted string.
 * @param {number|string} n
 * @returns {string}
 */
export function formatPermitId(n) {
  const num = typeof n === 'string' ? parseInt(n, 10) : n
  if (!Number.isFinite(num) || num < 1) return ''
  return `PRMT-${String(num).padStart(6, '0')}`
}

/**
 * Determine whether a permit is overdue based on its planned_finish date and current status.
 * A permit is overdue when today is past planned_finish and status is not 'acquired'.
 * @param {{ planned_finish: string|null, status: string|null }} permit
 * @param {Date} [now] - injectable for testing; defaults to new Date()
 * @returns {boolean}
 */
export function isOverdue(permit, now = new Date()) {
  if (!permit?.planned_finish) return false
  if (permit.status === 'acquired') return false
  return new Date(permit.planned_finish) < now
}

/**
 * Derive the display status for a permit.
 * If the db status is 'acquired', return 'acquired'.
 * Otherwise compute from dates.
 * @param {{ planned_finish: string|null, actual_start: string|null, actual_finish: string|null, status: string|null }} permit
 * @param {Date} [now]
 * @returns {'pending'|'in-progress'|'acquired'|'overdue'}
 */
export function computePermitStatus(permit, now = new Date()) {
  if (permit.status === 'acquired' || permit.actual_finish) return 'acquired'
  if (isOverdue(permit, now)) return 'overdue'
  if (permit.actual_start) return 'in-progress'
  return 'pending'
}

/** Badge colour classes per status (Tailwind). */
export const STATUS_BADGE = {
  pending:     'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  'in-progress': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  acquired:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  overdue:     'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}
```

```js
// src/test/permitUtils.test.js
import { describe, it, expect } from 'vitest'
import { formatPermitId, isOverdue, computePermitStatus } from '../lib/permitUtils'

describe('formatPermitId', () => {
  it('pads single-digit to 6 zeros', () => {
    expect(formatPermitId(1)).toBe('PRMT-000001')
  })
  it('pads 3-digit correctly', () => {
    expect(formatPermitId(123)).toBe('PRMT-000123')
  })
  it('handles 6-digit without padding', () => {
    expect(formatPermitId(999999)).toBe('PRMT-999999')
  })
  it('accepts numeric string', () => {
    expect(formatPermitId('42')).toBe('PRMT-000042')
  })
  it('returns empty string for 0', () => {
    expect(formatPermitId(0)).toBe('')
  })
  it('returns empty string for NaN', () => {
    expect(formatPermitId('abc')).toBe('')
  })
})

describe('isOverdue', () => {
  const past   = { planned_finish: '2020-01-01', status: 'pending' }
  const future = { planned_finish: '2099-01-01', status: 'pending' }
  const acquired = { planned_finish: '2020-01-01', status: 'acquired' }
  const noDate = { planned_finish: null, status: 'pending' }

  it('returns true when planned_finish is in the past and not acquired', () => {
    expect(isOverdue(past)).toBe(true)
  })
  it('returns false when planned_finish is in the future', () => {
    expect(isOverdue(future)).toBe(false)
  })
  it('returns false when status is acquired even if past', () => {
    expect(isOverdue(acquired)).toBe(false)
  })
  it('returns false when planned_finish is null', () => {
    expect(isOverdue(noDate)).toBe(false)
  })
  it('respects injected now date', () => {
    const permit = { planned_finish: '2026-06-01', status: 'pending' }
    expect(isOverdue(permit, new Date('2026-05-01'))).toBe(false)
    expect(isOverdue(permit, new Date('2026-07-01'))).toBe(true)
  })
})

describe('computePermitStatus', () => {
  it('returns acquired when actual_finish is set', () => {
    expect(computePermitStatus({ actual_finish: '2026-01-01', planned_finish: '2020-01-01', actual_start: null, status: null })).toBe('acquired')
  })
  it('returns acquired when status is acquired', () => {
    expect(computePermitStatus({ status: 'acquired', planned_finish: '2020-01-01', actual_start: null, actual_finish: null })).toBe('acquired')
  })
  it('returns overdue when past planned_finish and no actual_finish', () => {
    expect(computePermitStatus({ status: 'pending', planned_finish: '2020-01-01', actual_start: null, actual_finish: null })).toBe('overdue')
  })
  it('returns in-progress when actual_start is set and not overdue', () => {
    expect(computePermitStatus({ status: 'in-progress', planned_finish: '2099-01-01', actual_start: '2026-01-01', actual_finish: null })).toBe('in-progress')
  })
  it('returns pending by default', () => {
    expect(computePermitStatus({ status: 'pending', planned_finish: '2099-01-01', actual_start: null, actual_finish: null })).toBe('pending')
  })
})
```

---

## Task 2 — Notification Helpers

**Files:** `src/lib/notifications.js`, `src/test/notifications.test.js`

### Steps

- [ ] Create `src/lib/notifications.js` with the helper functions below.
- [ ] Create `src/test/notifications.test.js` with the tests below.
- [ ] Run `npm test` — all notification helper tests must pass.

```js
// src/lib/notifications.js

/**
 * Send an email notification via Resend when an issue is raised on a permit.
 *
 * In dev, calls Resend API directly from the client using VITE_RESEND_API_KEY.
 * In production, call a Supabase Edge Function instead to keep the key server-side.
 *
 * @param {{ issue: string, description?: string }} issue
 * @param {{ id: string, name: string, project_id: string }} permit
 * @param {{ email: string, full_name?: string }} assignedUser
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function sendIssueNotification(issue, permit, assignedUser) {
  const apiKey = import.meta.env.VITE_RESEND_API_KEY
  if (!apiKey || !assignedUser?.email) {
    return { ok: false, error: 'Missing API key or recipient email' }
  }

  const body = {
    from: 'DandC Dashboard <noreply@dandcdashboard.com>',
    to:   [assignedUser.email],
    subject: `Issue raised on permit ${permit.id} — ${permit.name}`,
    html: `
      <p>Hi ${assignedUser.full_name ?? assignedUser.email},</p>
      <p>A new issue has been raised on permit <strong>${permit.id} — ${permit.name}</strong>
         (Project: ${permit.project_id}).</p>
      <p><strong>Issue:</strong> ${issue.issue}</p>
      ${issue.description ? `<p><strong>Details:</strong> ${issue.description}</p>` : ''}
      <p>Please log in to the dashboard to review and resolve.</p>
    `,
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: text }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * Send a notification to a Microsoft Teams channel via incoming webhook.
 *
 * @param {{ title: string, text: string, permitId: string, permitName: string }} payload
 * @param {string} webhookUrl - the Teams incoming webhook URL from app_settings
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function sendTeamsNotification(payload, webhookUrl) {
  if (!webhookUrl) return { ok: false, error: 'No Teams webhook URL configured' }

  const body = {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: 'ed6055',
    summary: payload.title,
    sections: [
      {
        activityTitle: payload.title,
        activityText: payload.text,
        facts: [
          { name: 'Permit ID', value: payload.permitId },
          { name: 'Permit Name', value: payload.permitName },
        ],
      },
    ],
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: text }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
```

```js
// src/test/notifications.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendIssueNotification, sendTeamsNotification } from '../lib/notifications'

// Mock import.meta.env
vi.stubEnv('VITE_RESEND_API_KEY', 'test-key-123')

const mockIssue  = { issue: 'Missing signature', description: 'Approval page unsigned' }
const mockPermit = { id: 'PRMT-000001', name: 'Building Permit', project_id: 'PRJ-000001' }
const mockUser   = { email: 'user@example.com', full_name: 'Juan Cruz' }

describe('sendIssueNotification', () => {
  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { vi.restoreAllMocks() })

  it('returns ok:false when recipient email is missing', async () => {
    const result = await sendIssueNotification(mockIssue, mockPermit, { email: null })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/email/i)
  })

  it('calls Resend API with correct URL and auth header', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true })
    await sendIssueNotification(mockIssue, mockPermit, mockUser)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key-123' }),
      })
    )
  })

  it('returns ok:true on success', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true })
    const result = await sendIssueNotification(mockIssue, mockPermit, mockUser)
    expect(result.ok).toBe(true)
  })

  it('returns ok:false when fetch throws', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network'))
    const result = await sendIssueNotification(mockIssue, mockPermit, mockUser)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('network')
  })
})

describe('sendTeamsNotification', () => {
  const payload = { title: 'Issue raised', text: 'New issue', permitId: 'PRMT-000001', permitName: 'Building Permit' }

  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { vi.restoreAllMocks() })

  it('returns ok:false when webhookUrl is empty', async () => {
    const result = await sendTeamsNotification(payload, '')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/webhook/i)
  })

  it('calls the webhook URL with POST', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true })
    await sendTeamsNotification(payload, 'https://teams.example.com/webhook')
    expect(global.fetch).toHaveBeenCalledWith('https://teams.example.com/webhook', expect.objectContaining({ method: 'POST' }))
  })

  it('returns ok:true on success', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true })
    const result = await sendTeamsNotification(payload, 'https://teams.example.com/webhook')
    expect(result.ok).toBe(true)
  })

  it('returns ok:false on fetch error', async () => {
    global.fetch.mockRejectedValueOnce(new Error('timeout'))
    const result = await sendTeamsNotification(payload, 'https://teams.example.com/webhook')
    expect(result.ok).toBe(false)
  })
})
```

---

## Task 3 — PermitsDashboard Page

**Files:** `src/pages/admin/PermitsDashboard.jsx`, `src/App.jsx`

### Steps

- [ ] Create `src/pages/admin/PermitsDashboard.jsx` using the code below.
- [ ] In `src/App.jsx`:
  - Add `import PermitsDashboard from './pages/admin/PermitsDashboard'` alongside the other admin imports.
  - Add the route inside the `<Routes>` block after the existing admin routes:
    ```jsx
    <Route path="/admin/permits" element={<ProtectedRoute roles={['admin','head','reviewer','endorser','reporter','viewer']}><PermitsDashboard /></ProtectedRoute>} />
    ```
  - The `roles` array covers all HO roles — access is enforced again at the RLS layer. Site users have no `team='ho'` so RLS blocks their data even if they somehow reach the route.

```jsx
// src/pages/admin/PermitsDashboard.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import DashboardLayout from '../../components/DashboardLayout'
import useProfile from '../../hooks/useProfile'
import LoadingScreen from '../../components/LoadingScreen'
import PermitDetail from '../../components/PermitDetail'
import { computePermitStatus, STATUS_BADGE } from '../../lib/permitUtils'

const STATUS_OPTIONS = ['all', 'pending', 'in-progress', 'acquired', 'overdue']

export default function PermitsDashboard() {
  const { profile, loading: profileLoading } = useProfile()
  const isAdmin = profile?.role === 'admin'

  const [permits,  setPermits]  = useState([])
  const [projects, setProjects] = useState([])
  const [loading,  setLoading]  = useState(true)

  const [filterProject, setFilterProject] = useState('all')
  const [filterStatus,  setFilterStatus]  = useState('all')
  const [search,        setSearch]        = useState('')
  const [selected,      setSelected]      = useState(null) // permit row for PermitDetail

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: pData }, { data: projData }] = await Promise.all([
      supabase
        .from('permits')
        .select('*, projects(name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('projects')
        .select('id, name')
        .order('name'),
    ])
    setPermits(pData ?? [])
    setProjects(projData ?? [])
    setLoading(false)
  }

  const rows = (permits ?? []).filter(p => {
    const effectiveStatus = computePermitStatus(p)
    const matchProject = filterProject === 'all' || p.project_id === filterProject
    const matchStatus  = filterStatus  === 'all' || effectiveStatus === filterStatus
    const q = search.toLowerCase()
    const matchSearch  = !q ||
      p.id?.toLowerCase().includes(q) ||
      p.name?.toLowerCase().includes(q) ||
      (p.projects?.name ?? '').toLowerCase().includes(q) ||
      (p.responsible_person ?? '').toLowerCase().includes(q)
    return matchProject && matchStatus && matchSearch
  })

  const counts = {
    total:      permits.length,
    pending:    permits.filter(p => computePermitStatus(p) === 'pending').length,
    inProgress: permits.filter(p => computePermitStatus(p) === 'in-progress').length,
    acquired:   permits.filter(p => computePermitStatus(p) === 'acquired').length,
    overdue:    permits.filter(p => computePermitStatus(p) === 'overdue').length,
  }

  if (loading || profileLoading) return <LoadingScreen />

  return (
    <DashboardLayout profile={profile}>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Permits Monitoring</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">All permits across all projects</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total',       value: counts.total,      color: 'text-gray-700 dark:text-gray-200' },
            { label: 'Pending',     value: counts.pending,    color: 'text-gray-600 dark:text-gray-400' },
            { label: 'In Progress', value: counts.inProgress, color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Acquired',    value: counts.acquired,   color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Overdue',     value: counts.overdue,    color: 'text-red-600 dark:text-red-400' },
          ].map(c => (
            <div key={c.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{c.label}</p>
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search permits..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[180px] px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40"
          />
          <select
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40"
          >
            <option value="all">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40"
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                  {['Permit ID','Project','Name','Status','Planned Finish','Forecast Finish','Responsible'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">No permits found.</td></tr>
                )}
                {rows.map(permit => {
                  const status = computePermitStatus(permit)
                  return (
                    <tr
                      key={permit.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
                      onClick={() => setSelected(permit)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{permit.id}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap max-w-[160px] truncate">{permit.projects?.name ?? permit.project_id}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{permit.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{permit.planned_finish ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{permit.forecast_finish ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{permit.responsible_person ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={e => { e.stopPropagation(); setSelected(permit) }}
                          className="text-xs text-[#ed6055] hover:underline font-medium"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* PermitDetail drawer */}
      {selected && (
        <PermitDetail
          permit={selected}
          isAdmin={isAdmin}
          isHead={profile?.role === 'head'}
          currentUserId={profile?.id}
          onClose={() => setSelected(null)}
          onUpdated={fetchAll}
        />
      )}
    </DashboardLayout>
  )
}
```

---

## Task 4 — PermitDetail Component

**Files:** `src/components/PermitDetail.jsx`

### Steps

- [ ] Create `src/components/PermitDetail.jsx` using the code below.
- [ ] Verify that raising an issue calls `sendIssueNotification` and `sendTeamsNotification` correctly by checking the console in the running app (smoke test step covers this).

```jsx
// src/components/PermitDetail.jsx
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { computePermitStatus, STATUS_BADGE } from '../lib/permitUtils'
import { sendIssueNotification, sendTeamsNotification } from '../lib/notifications'

function DateRow({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-gray-900 dark:text-white">{value ?? '—'}</p>
    </div>
  )
}

export default function PermitDetail({ permit: initialPermit, isAdmin, isHead, currentUserId, onClose, onUpdated }) {
  const [permit,       setPermit]       = useState(initialPermit)
  const [requirements, setRequirements] = useState([])
  const [issues,       setIssues]       = useState([])
  const [saving,       setSaving]       = useState(false)
  const [remarksDraft, setRemarksDraft] = useState(initialPermit.remarks ?? '')

  // Raise-issue form
  const [issueText,    setIssueText]    = useState('')
  const [issueDesc,    setIssueDesc]    = useState('')
  const [raisingIssue, setRaisingIssue] = useState(false)

  const overlayRef = useRef(null)

  useEffect(() => { fetchDetail() }, [permit.id])

  async function fetchDetail() {
    const [{ data: rData }, { data: iData }] = await Promise.all([
      supabase.from('permit_requirements').select('*').eq('permit_id', permit.id).order('sort_order'),
      supabase.from('permit_issues').select('*, raised_profile:profiles!raised_by(full_name), assigned_profile:profiles!assigned_to(full_name)').eq('permit_id', permit.id).order('created_at'),
    ])
    setRequirements(rData ?? [])
    setIssues(iData ?? [])
  }

  async function saveRemarks() {
    setSaving(true)
    const { data } = await supabase
      .from('permits')
      .update({ remarks: remarksDraft })
      .eq('id', permit.id)
      .select()
      .single()
    setSaving(false)
    if (data) { setPermit(data); onUpdated?.() }
  }

  async function toggleRequirement(req) {
    if (!isAdmin && !isHead) return
    const now = new Date().toISOString()
    const patch = req.is_complete
      ? { is_complete: false, completed_at: null, completed_by: null }
      : { is_complete: true,  completed_at: now,  completed_by: currentUserId }
    const { data } = await supabase
      .from('permit_requirements')
      .update(patch)
      .eq('id', req.id)
      .select()
      .single()
    if (data) setRequirements(prev => prev.map(r => r.id === data.id ? data : r))
  }

  async function resolveIssue(issue) {
    if (!isAdmin && !isHead) return
    const { data } = await supabase
      .from('permit_issues')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', issue.id)
      .select()
      .single()
    if (data) setIssues(prev => prev.map(i => i.id === data.id ? { ...i, ...data } : i))
  }

  async function raiseIssue(e) {
    e.preventDefault()
    if (!issueText.trim()) return
    setRaisingIssue(true)

    const { data: newIssue, error } = await supabase
      .from('permit_issues')
      .insert({ permit_id: permit.id, issue: issueText.trim(), description: issueDesc.trim() || null, raised_by: currentUserId, status: 'open' })
      .select()
      .single()

    if (!error && newIssue) {
      setIssues(prev => [...prev, newIssue])
      setIssueText('')
      setIssueDesc('')

      // In-app notification: insert row for assigned_to (or all admins — simplified: skip for now)
      // Email notification
      sendIssueNotification(newIssue, permit, {}) // assignedUser from permit.responsible_person if email available

      // Teams notification: fetch webhook from app_settings
      supabase.from('app_settings').select('value').eq('key', 'teams_webhook_url').single()
        .then(({ data: setting }) => {
          if (setting?.value) {
            sendTeamsNotification({
              title: `Issue raised on ${permit.id}`,
              text:  newIssue.issue,
              permitId:   permit.id,
              permitName: permit.name,
            }, setting.value)
          }
        })
    }

    setRaisingIssue(false)
  }

  const status = computePermitStatus(permit)
  const canManage = isAdmin || isHead

  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={e => { if (e.target === overlayRef.current) onClose() }}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-gray-400">{permit.id}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>{status}</span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white leading-tight">{permit.name}</h2>
            {permit.responsible_person && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{permit.responsible_person}</p>
            )}
          </div>
          <button onClick={onClose} className="flex-shrink-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none font-bold">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
          {/* Date grid */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Schedule</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <DateRow label="Planned Start"    value={permit.planned_start} />
              <DateRow label="Planned Finish"   value={permit.planned_finish} />
              <DateRow label="Forecast Start"   value={permit.forecast_start} />
              <DateRow label="Forecast Finish"  value={permit.forecast_finish} />
              <DateRow label="Actual Start"     value={permit.actual_start} />
              <DateRow label="Actual Finish"    value={permit.actual_finish} />
              <DateRow label="Remaining (days)" value={permit.remaining_duration != null ? String(permit.remaining_duration) : null} />
            </div>
          </section>

          {/* Remarks */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Remarks</h3>
            <textarea
              value={remarksDraft}
              onChange={e => setRemarksDraft(e.target.value)}
              rows={3}
              readOnly={!canManage}
              placeholder={canManage ? 'Add remarks...' : 'No remarks.'}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40 disabled:opacity-60"
            />
            {canManage && (
              <button
                onClick={saveRemarks}
                disabled={saving}
                className="mt-2 px-4 py-1.5 text-sm font-medium rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] disabled:opacity-50 transition"
              >
                {saving ? 'Saving...' : 'Save Remarks'}
              </button>
            )}
          </section>

          {/* Checklist */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Requirements
              <span className="ml-2 text-gray-400 normal-case font-normal">
                {requirements.filter(r => r.is_complete).length}/{requirements.length} complete
              </span>
            </h3>
            {requirements.length === 0 && <p className="text-sm text-gray-400">No requirements added yet.</p>}
            <ul className="space-y-2">
              {requirements.map(req => (
                <li key={req.id} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={req.is_complete}
                    onChange={() => toggleRequirement(req)}
                    disabled={!canManage}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#ed6055] focus:ring-[#ed6055]/40 cursor-pointer disabled:cursor-default"
                  />
                  <span className={`text-sm ${req.is_complete ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                    {req.description}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Issues */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Issues</h3>
            {issues.length === 0 && <p className="text-sm text-gray-400 mb-4">No issues raised.</p>}
            <ul className="space-y-3 mb-6">
              {issues.map(issue => (
                <li key={issue.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{issue.issue}</p>
                    <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${issue.status === 'resolved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                      {issue.status}
                    </span>
                  </div>
                  {issue.description && <p className="text-xs text-gray-500 dark:text-gray-400">{issue.description}</p>}
                  <p className="text-[11px] text-gray-400">
                    Raised by {issue.raised_profile?.full_name ?? 'unknown'}
                    {issue.resolved_at ? ` · Resolved ${new Date(issue.resolved_at).toLocaleDateString()}` : ''}
                  </p>
                  {canManage && issue.status === 'open' && (
                    <button
                      onClick={() => resolveIssue(issue)}
                      className="text-xs text-[#ed6055] hover:underline font-medium"
                    >
                      Mark resolved
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {/* Raise issue form */}
            <form onSubmit={raiseIssue} className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Raise an Issue</p>
              <input
                type="text"
                value={issueText}
                onChange={e => setIssueText(e.target.value)}
                placeholder="Issue title..."
                required
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40"
              />
              <textarea
                value={issueDesc}
                onChange={e => setIssueDesc(e.target.value)}
                placeholder="Details (optional)..."
                rows={2}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40"
              />
              <button
                type="submit"
                disabled={raisingIssue || !issueText.trim()}
                className="px-4 py-1.5 text-sm font-medium rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] disabled:opacity-50 transition"
              >
                {raisingIssue ? 'Raising...' : 'Raise Issue'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </>
  )
}
```

---

## Task 5 — PermitsTab for ProjectDetailModal

**Files:** `src/components/PermitsTab.jsx`, `src/components/ProjectDetailModal.jsx`

### Steps

- [ ] Create `src/components/PermitsTab.jsx` using the code below.
- [ ] In `src/components/ProjectDetailModal.jsx`:
  - Find the import for the old `ComplianceTab` (it is defined inline as a function at line 2272, not a separate import) — the new `PermitsTab` replaces it.
  - Add at the top of the file: `import PermitsTab from './PermitsTab'`
  - Find line ~4705: `{tab === 'Permits' && <ComplianceTab project={project} isAdmin={isAdmin} showToast={showToast} />}`
  - Replace with: `{tab === 'Permits' && <PermitsTab project={project} isAdmin={isAdmin} isHead={profile?.role === 'head'} currentUserId={profile?.id} showToast={showToast} />}`
  - Find the `tabCounts.permits` computation (search for `permits:`) — update it to count from the new `permits` table (the new PermitsTab manages its own data fetch, so `tabCounts.permits` can be set to the count query against the new table; alternatively keep the existing count query if it already queries `project_permits` and change it to query `permits` with `project_id = project.id`).

```jsx
// src/components/PermitsTab.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import PermitDetail from './PermitDetail'
import { computePermitStatus, STATUS_BADGE } from '../lib/permitUtils'

export default function PermitsTab({ project, isAdmin, isHead, currentUserId, showToast }) {
  const [permits,  setPermits]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)

  // New permit form state
  const [form, setForm] = useState({ name: '', responsible_person: '', planned_start: '', planned_finish: '', remarks: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [project.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('permits')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
    setPermits(data ?? [])
    setLoading(false)
  }

  async function createPermit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('permits')
      .insert({ ...form, project_id: project.id, status: 'pending', created_by: currentUserId })
    setSaving(false)
    if (error) { showToast?.('Failed to create permit: ' + error.message, 'error'); return }
    setForm({ name: '', responsible_person: '', planned_start: '', planned_finish: '', remarks: '' })
    setCreating(false)
    load()
  }

  async function deletePermit(id) {
    if (!isAdmin) return
    const { error } = await supabase.from('permits').delete().eq('id', id)
    if (error) { showToast?.('Failed to delete permit.', 'error'); return }
    setPermits(prev => prev.filter(p => p.id !== id))
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">Loading permits...</div>
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {permits.length} permit{permits.length !== 1 ? 's' : ''}
        </p>
        {isAdmin && !creating && (
          <button
            onClick={() => setCreating(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] transition"
          >
            + Add Permit
          </button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <form onSubmit={createPermit} className="bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">New Permit</p>
          <input
            required
            type="text"
            placeholder="Permit name (e.g. Building Permit)"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40"
          />
          <input
            type="text"
            placeholder="Responsible person (job title or name)"
            value={form.responsible_person}
            onChange={e => setForm(f => ({ ...f, responsible_person: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-400 mb-0.5 block">Planned Start</label>
              <input type="date" value={form.planned_start} onChange={e => setForm(f => ({ ...f, planned_start: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40" />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 mb-0.5 block">Planned Finish</label>
              <input type="date" value={form.planned_finish} onChange={e => setForm(f => ({ ...f, planned_finish: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setCreating(false)} className="px-4 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-1.5 text-sm font-medium rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] disabled:opacity-50 transition">
              {saving ? 'Saving...' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {/* Permits list */}
      {permits.length === 0 && !creating && (
        <p className="text-sm text-gray-400 py-4 text-center">No permits yet for this project.</p>
      )}
      <ul className="space-y-2">
        {permits.map(permit => {
          const status = computePermitStatus(permit)
          return (
            <li
              key={permit.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer transition-colors"
              onClick={() => setSelected(permit)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[11px] text-gray-400">{permit.id}</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>{status}</span>
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5 truncate">{permit.name}</p>
                {permit.responsible_person && (
                  <p className="text-xs text-gray-400 truncate">{permit.responsible_person}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                {permit.planned_finish && (
                  <p className="text-xs text-gray-500">{permit.planned_finish}</p>
                )}
                {isAdmin && (
                  <button
                    onClick={e => { e.stopPropagation(); deletePermit(permit.id) }}
                    className="text-[11px] text-red-400 hover:text-red-600 hover:underline mt-1 block"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {/* PermitDetail drawer */}
      {selected && (
        <PermitDetail
          permit={selected}
          isAdmin={isAdmin}
          isHead={isHead}
          currentUserId={currentUserId}
          onClose={() => setSelected(null)}
          onUpdated={load}
        />
      )}
    </div>
  )
}
```

---

## Task 6 — Sidebar Section

**Files:** `src/components/Sidebar.jsx`

### Steps

- [ ] Add `ClipboardDocumentListIcon` (or suitable icon) to the heroicons import at the top of `Sidebar.jsx`. The file likely already imports from `@heroicons/react/24/outline` — add `ClipboardDocumentListIcon` to that import.
- [ ] After the existing Admin Users section (after line 142), add the new Permits Monitoring section below. Insert it inside the same column/scroll area, immediately after the closing `)}` of the Admin Users block:

```jsx
{/* ── Permits Monitoring section (HO users only) ── */}
{profile?.team === 'ho' && (
  <div className="mt-6 px-4">
    <p className="mb-2 text-[10px] font-semibold text-white/20 uppercase tracking-widest select-none">
      Permits Monitoring
    </p>
    <div className="grid grid-cols-2 gap-2">
      <NavLink
        to="/admin/permits"
        onClick={onClose}
        className={({ isActive }) => [
          'flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl',
          'border transition-all duration-150 text-center',
          isActive
            ? 'bg-white/10 border-[#ed6055]/50 text-white'
            : 'bg-white/[0.04] border-white/[0.08] text-white/50 hover:bg-white/[0.08] hover:text-white/80',
        ].join(' ')}
      >
        <ClipboardDocumentListIcon className="w-5 h-5 flex-shrink-0" />
        <span className="text-[10px] font-medium leading-tight">Permits Dashboard</span>
      </NavLink>
    </div>
  </div>
)}
```

**Note:** The condition `profile?.team === 'ho'` requires that `useProfile()` returns the `team` field. Verify that the `profiles` select query in `useProfile.js` (or wherever the profile is fetched) includes `team`. If not, add it.

---

## Task 7 — NotificationBell Component

**Files:** `src/components/NotificationBell.jsx`, `src/components/DashboardLayout.jsx`

### Steps

- [ ] Create `src/components/NotificationBell.jsx` using the code below.
- [ ] In `src/components/DashboardLayout.jsx`, import `NotificationBell` and mount it in the top bar (header area) next to the existing profile/avatar button. Find where the profile button is rendered and add `<NotificationBell userId={profile?.id} />` immediately before or after it.

```jsx
// src/components/NotificationBell.jsx
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

function BellIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
    </svg>
  )
}

export default function NotificationBell({ userId }) {
  const [notifications, setNotifications] = useState([])
  const [open,          setOpen]          = useState(false)
  const panelRef = useRef(null)

  const unread = notifications.filter(n => !n.read_at)

  useEffect(() => {
    if (!userId) return
    fetchNotifications()

    // Realtime subscription
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, payload => {
        setNotifications(prev => [payload.new, ...prev])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function fetchNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifications(data ?? [])
  }

  async function markRead(notification) {
    if (notification.read_at) return
    const { data } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notification.id)
      .select()
      .single()
    if (data) setNotifications(prev => prev.map(n => n.id === data.id ? data : n))
  }

  async function markAllRead() {
    const ids = unread.map(n => n.id)
    if (!ids.length) return
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', ids)
    setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n))
  }

  function formatPayload(n) {
    if (n.payload?.message) return n.payload.message
    if (n.type === 'issue_raised')   return `Issue raised on ${n.payload?.permit_name ?? n.payload?.permit_id}`
    if (n.type === 'issue_resolved') return `Issue resolved on ${n.payload?.permit_name ?? n.payload?.permit_id}`
    if (n.type === 'permit_overdue') return `Permit overdue: ${n.payload?.permit_name ?? n.payload?.permit_id}`
    return n.type ?? 'Notification'
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.08] transition"
        aria-label="Notifications"
      >
        <BellIcon className="w-5 h-5" />
        {unread.length > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#ed6055] text-[9px] font-bold text-white leading-none">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</p>
            {unread.length > 0 && (
              <button onClick={markAllRead} className="text-xs text-[#ed6055] hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {notifications.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-gray-400">No notifications yet.</li>
            )}
            {notifications.map(n => (
              <li
                key={n.id}
                onClick={() => markRead(n)}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${!n.read_at ? 'bg-[#ed6055]/5' : ''}`}
              >
                <p className={`text-sm leading-snug ${!n.read_at ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                  {formatPayload(n)}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

---

## Task 8 — Smoke Test

**Steps:**

- [ ] Run `npm test` — all tests (gantt, scurve, permit utilities, notifications) must pass with 0 failures.
- [ ] Run `npm run dev` and open the app in the browser.
- [ ] Sign in as an admin user. Verify:
  - [ ] Sidebar shows "Permits Monitoring" section with "Permits Dashboard" card.
  - [ ] Navigating to `/admin/permits` loads the PermitsDashboard with 5 summary cards and an empty table.
  - [ ] Creating a permit (if the UI has a create button — consider adding one to PermitsDashboard for admin) navigates to the detail drawer.
  - [ ] Opening a project via `/projects/:slug` and clicking the Permits tab shows the new `PermitsTab` (not the old ComplianceTab tree).
  - [ ] Adding a permit from the Permits tab, then clicking it opens the PermitDetail drawer.
  - [ ] Toggling a requirement checkbox (as admin) persists the change on refresh.
  - [ ] Raising an issue saves to `permit_issues` and a console message confirms the Teams/email notification calls.
  - [ ] The NotificationBell shows in the top bar with a 0 badge.
- [ ] Sign in as a non-HO (site) user and confirm `/admin/permits` redirects to `/unauthorized`.
- [ ] Verify in Supabase Studio that the `permits_id_seq` sequence increments correctly and permit IDs are formatted as `PRMT-000001`.
