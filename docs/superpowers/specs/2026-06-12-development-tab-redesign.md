# Development Tab Redesign
**Date:** 2026-06-12  
**Status:** Approved

## Summary
Redesign the Development tab so users can manage Towers/Locations, then per tower define two fixed sections (Residential Units, Parking Units), each with floors containing unit counts and M4/M5 planned schedules. An improved bulk-add modal replaces the existing one.

---

## Data Model
No new DB tables required. Existing tables map to the two sections:

| Section | Table |
|---|---|
| Residential Units | `project_floors` |
| Parking Units | `project_parking_floors` |

Both tables share the same schema: `project_id`, `building_id`, `physical_level`, `marketing_level`, `num_units`, `m4_planned_start`, `m4_planned_end`, `m5_planned_start`, `m5_planned_end`.

`project_buildings` continues to store Towers/Locations with `project_id`, `name`, `sort_order`.

---

## Layout

```
┌──────────────────────────────────────────────────────────┐
│  Towers / Locations                [+ Add Tower/Location] │
│  [Tower A]  [Tower B]  [+3 more ▾]                        │
├──────────────────────────────────────────────────────────┤
│  Tower A                                                  │
│  30 floors · 240 units (Residential)                      │
│   5 floors · 120 spaces (Parking)                         │
├──────────────────────────────────────────────────────────┤
│  Residential Units       [Bulk Add]  [+ Add Floor]        │
│  ┌────────┬──────┬───────┬──────────────┬───────────────┐ │
│  │ Floor  │ Mktg │ Units │ M4 Planned   │ M5 Planned    │ │
│  │  1F    │  1F  │   8   │ Jan – Mar 25 │ Apr – Jun 25  │ │
│  └────────┴──────┴───────┴──────────────┴───────────────┘ │
│                                                            │
│  Parking Units           [Bulk Add]  [+ Add Floor]        │
│  ┌────────┬──────┬────────┬─────────────┬───────────────┐ │
│  │ Floor  │ Mktg │ Spaces │ M4 Planned  │ M5 Planned    │ │
│  └────────┴──────┴────────┴─────────────┴───────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Towers/Locations Header
- Label: **Towers / Locations**
- Uses existing `BuildingSelector` with `canAdd={true}`
- `+ Add Tower/Location` button label (replaces "Add Building")
- Existing overflow `+N more` pill behavior retained
- No rename/delete buttons on pills (already removed)

### 2. Tower Summary Strip
- Shown below the building selector when a tower is selected
- Displays: `X floors · Y units (Residential)` and `X floors · Y spaces (Parking)`
- Derived from loaded floor data — no extra DB queries

### 3. Residential Units Section
- Section header: **Residential Units**
- Actions: `[Bulk Add]` + `[+ Add Floor]`
- Table columns: Physical Level | Marketing Level | Units | M4 Start | M4 End | M5 Start | M5 End | (actions)
- Inline row editing (existing pattern)
- Delete with confirmation (existing pattern)

### 4. Parking Units Section
- Same structure as Residential Units
- Section header: **Parking Units**
- "Units" column label becomes **Spaces**

### 5. Improved Bulk Add Modal (shared by both sections)
Replaces existing `BulkAddFloorsModal`. New fields:

| Field | Description |
|---|---|
| Floor label format | Radio: **Numeric** (1, 2, 3) · **Prefixed** (P1, P2 / B1, B2 — user sets prefix) · **Custom** (user types start label, system increments numerically) |
| Floor range | From floor # → To floor # (same as existing) |
| Units per floor | Number input (same as existing) |
| M4 date range | Optional start + end date — applied to all generated floors |
| M5 date range | Optional start + end date — applied to all generated floors |
| Live preview | Text line: *"Will generate 12 floors: 1F, 2F … 12F — 8 units each"* |

Validation:
- Floor range: to ≥ from
- Units: non-negative integer
- Dates: valid calendar dates, end ≥ start
- If M5 start/end provided and M4 end provided: M5 start ≥ M4 start

### 6. Excel Import/Export
- Unchanged — buttons remain in the sticky header
- Export still exports both floor tables

---

## Unchanged
- Inline row editing and delete (existing pattern)
- Excel import/export
- `+N more` overflow in building selector
- All existing validation logic on save

---

## Not In Scope
- Custom location groups beyond Residential + Parking
- Reordering floors via drag and drop
- Per-floor unit breakdown (unit types per floor)
