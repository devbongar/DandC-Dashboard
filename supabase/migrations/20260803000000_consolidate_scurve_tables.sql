-- Consolidate 6 scurve tables into 3 unified tables.
-- building_id NULL  = project-level scope
-- building_id UUID  = tower-level scope
-- Replaces: project_scurve_baseline_data, tower_scurve_baseline_data,
--           project_scurve_actual, tower_scurve_actual,
--           project_scurve_forecast, tower_scurve_forecast

-- ── 1. New unified tables ──────────────────────────────────────────────────────

CREATE TABLE scurve_baseline_data (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES projects(id)                 ON DELETE CASCADE,
  baseline_id uuid        NOT NULL REFERENCES project_scurve_baselines(id) ON DELETE CASCADE,
  building_id uuid                 REFERENCES project_buildings(id)         ON DELETE CASCADE,
  period_date date        NOT NULL,
  planned_pct numeric(6,2),
  created_at  timestamptz DEFAULT now()
);

-- Partial unique indexes handle nullable building_id (NULL != NULL in standard UNIQUE)
CREATE UNIQUE INDEX scurve_baseline_data_project_uniq
  ON scurve_baseline_data (baseline_id, period_date) WHERE building_id IS NULL;
CREATE UNIQUE INDEX scurve_baseline_data_tower_uniq
  ON scurve_baseline_data (baseline_id, building_id, period_date) WHERE building_id IS NOT NULL;


CREATE TABLE scurve_actual (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES projects(id)         ON DELETE CASCADE,
  building_id uuid                 REFERENCES project_buildings(id) ON DELETE CASCADE,
  period_date date        NOT NULL,
  actual_pct  numeric(6,2),
  updated_at  timestamptz,
  created_at  timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX scurve_actual_project_uniq
  ON scurve_actual (project_id, period_date) WHERE building_id IS NULL;
CREATE UNIQUE INDEX scurve_actual_tower_uniq
  ON scurve_actual (project_id, building_id, period_date) WHERE building_id IS NOT NULL;


CREATE TABLE scurve_forecast (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid        NOT NULL REFERENCES projects(id)         ON DELETE CASCADE,
  building_id  uuid                 REFERENCES project_buildings(id) ON DELETE CASCADE,
  period_date  date        NOT NULL,
  forecast_pct numeric(6,2),
  updated_at   timestamptz,
  created_at   timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX scurve_forecast_project_uniq
  ON scurve_forecast (project_id, period_date) WHERE building_id IS NULL;
CREATE UNIQUE INDEX scurve_forecast_tower_uniq
  ON scurve_forecast (project_id, building_id, period_date) WHERE building_id IS NOT NULL;


-- ── 2. Migrate data ────────────────────────────────────────────────────────────

-- project_scurve_baseline_data has no project_id column; join baselines to get it
INSERT INTO scurve_baseline_data (id, project_id, baseline_id, building_id, period_date, planned_pct, created_at)
SELECT d.id, b.project_id, d.baseline_id, NULL, d.period_date, d.planned_pct, now()
FROM   project_scurve_baseline_data d
JOIN   project_scurve_baselines b ON b.id = d.baseline_id;

INSERT INTO scurve_baseline_data (id, project_id, baseline_id, building_id, period_date, planned_pct, created_at)
SELECT d.id, b.project_id, d.baseline_id, d.building_id, d.period_date, d.planned_pct, now()
FROM   tower_scurve_baseline_data d
JOIN   project_scurve_baselines b ON b.id = d.baseline_id;

-- project_scurve_actual has no created_at; use now() as default
INSERT INTO scurve_actual (id, project_id, building_id, period_date, actual_pct, updated_at, created_at)
SELECT id, project_id, NULL, period_date, actual_pct, updated_at, now()
FROM   project_scurve_actual;

INSERT INTO scurve_actual (id, project_id, building_id, period_date, actual_pct, updated_at, created_at)
SELECT id, project_id, building_id, period_date, actual_pct, updated_at, created_at
FROM   tower_scurve_actual;

INSERT INTO scurve_forecast (id, project_id, building_id, period_date, forecast_pct, updated_at, created_at)
SELECT id, project_id, NULL, period_date, forecast_pct, updated_at, now()
FROM   project_scurve_forecast;

INSERT INTO scurve_forecast (id, project_id, building_id, period_date, forecast_pct, updated_at, created_at)
SELECT id, project_id, building_id, period_date, forecast_pct, updated_at, created_at
FROM   tower_scurve_forecast;


-- ── 3. RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE scurve_baseline_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE scurve_actual        ENABLE ROW LEVEL SECURITY;
ALTER TABLE scurve_forecast      ENABLE ROW LEVEL SECURITY;

-- baseline data: authenticated read, admin write
CREATE POLICY "scurve_baseline_data_read" ON scurve_baseline_data
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "scurve_baseline_data_write" ON scurve_baseline_data
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- actual / forecast: authenticated read and write
CREATE POLICY "scurve_actual_read"  ON scurve_actual FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "scurve_actual_write" ON scurve_actual FOR ALL    USING (auth.role() = 'authenticated');

CREATE POLICY "scurve_forecast_read"  ON scurve_forecast FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "scurve_forecast_write" ON scurve_forecast FOR ALL    USING (auth.role() = 'authenticated');


-- ── 4. Drop old tables ─────────────────────────────────────────────────────────

DROP TABLE IF EXISTS tower_scurve_baseline_data;
DROP TABLE IF EXISTS tower_scurve_actual;
DROP TABLE IF EXISTS tower_scurve_forecast;
DROP TABLE IF EXISTS project_scurve_baseline_data;
DROP TABLE IF EXISTS project_scurve_actual;
DROP TABLE IF EXISTS project_scurve_forecast;
