# Project Detail Modal — Navigation Redesign

**Date:** 2026-06-14
**Status:** Approved
**File:** `src/components/ProjectDetailModal.jsx`

## Problem

The current modal has several UX issues:
- Overview is a tab but contains only static read data — it doesn't belong alongside action tabs
- "4PH Project: Yes" is displayed in red, implying an error when it's a positive attribute
- Tab bar gives no signal about which tabs have data vs. are empty
- Edit Details button is isolated far from the content it edits
- Large whitespace below the sparse Overview fields

## Design

### 1. Dark Hero Header

Replace the plain white header with a dark gradient (`#1e293b → #2d3f55`) that permanently displays all project overview fields. The header is always visible regardless of which tab is active.

**Top row:**
- Left: Project name (bold, white) + 4PH badge + phase pill
- Right: ✎ edit icon + ✕ close icon (grouped, subtle)

**Subtitle row:**
- Development type · City, Province (muted white text)

**Fields grid (4-column):**
- Project Code · 4PH Project · Business Unit · Dev Type
- Province · City / Municipality · Project Lot Area · Dev Area

**Color fixes:**
- "4PH: Yes" → green badge (`rgba(34,197,94,0.2)` background, `#86efac` text)
- "4PH: No" → muted white text (no color emphasis)

### 2. Edit Mode

Clicking ✎ toggles the header into edit mode inline — no separate modal or page navigation.

- Fields become inputs styled for the dark background
- ✎ and ✕ buttons are replaced by Save and Cancel
- On save: calls existing `supabase.from('projects').update()`, returns to read view
- On cancel: discards changes, returns to read view
- Validation unchanged from current implementation

### 3. Tabs (5, reduced from 6)

Overview tab is removed — its content now lives in the header. The 5 remaining tabs:

| Tab | Count badge | Badge color |
|---|---|---|
| Development | — | — |
| Permits | live COUNT | neutral |
| Milestones | live COUNT | neutral |
| Issues & Concerns | live COUNT | red when > 0 |
| Completion (M4/M5) | — | — |

Tab content inside each tab is **unchanged**.

### 4. Live Count Queries

Three parallel COUNT queries fire when the modal opens (alongside existing data loads):

```js
supabase.from('project_permits').select('*', { count: 'exact', head: true }).eq('project_id', id)
supabase.from('milestone_baselines').select('*', { count: 'exact', head: true }).eq('project_id', id)
supabase.from('issues').select('*', { count: 'exact', head: true }).eq('project_id', id).eq('status', 'open')
```

- `project_permits` — filtered by `project_id`
- `milestone_baselines` — counts baseline versions per project (each baseline is a milestone schedule)
- `issues` — filtered by `project_id` and `status = 'open'` only

Counts are stored in a `tabCounts` state object: `{ permits, milestones, issues }`.

Counts display as `null` (hidden badge) while loading, then show the number once resolved.

## Scope

**In scope:**
- Hero header (read + edit mode)
- Tab bar reduction (6 → 5 tabs)
- Live count badges on 3 tabs
- Semantic color fix for 4PH field

**Out of scope:**
- Any content inside the 5 tabs
- Mobile/responsive changes
- Other components or pages

## Component Changes

- `ProjectDetailModal.jsx` — main changes here
  - New `HeroHeader` section (replaces old modal title + Overview tab)
  - `OverviewTab` component retired (its JSX absorbed into the hero)
  - `BASE_TABS` constant updated: remove `'Overview'`, keep remaining 5
  - New `tabCounts` state + `loadCounts()` effect on modal open
  - Edit mode state lifted to hero level (was inside `OverviewTab`)
