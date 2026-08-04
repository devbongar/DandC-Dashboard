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
SELECT id, project_id, label, created_at
FROM milestone_baselines
ON CONFLICT DO NOTHING;

-- ── 3. Migrate tasks (one row per task, dedup by project+sort_order+name) ────

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

-- ── 4. Migrate dependencies to JSONB ──────────────────────────────────────────

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

-- ── 8. Drop old tables (UNCOMMENT ONLY after verifying new tables look correct) ──
-- DROP TABLE IF EXISTS workprogram_dependencies;
-- DROP TABLE IF EXISTS workprogram_activities;
-- DROP TABLE IF EXISTS milestone_baselines;
