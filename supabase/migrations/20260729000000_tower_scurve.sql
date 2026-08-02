-- Tower-level S-curve tables
-- Same baseline records as project level (project_scurve_baselines),
-- but data rows are scoped to a specific building.

-- ── tower_scurve_baseline_data ───────────────────────────────────────────────
CREATE TABLE tower_scurve_baseline_data (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id uuid        NOT NULL REFERENCES project_scurve_baselines(id) ON DELETE CASCADE,
  building_id uuid        NOT NULL REFERENCES project_buildings(id)         ON DELETE CASCADE,
  period_date date        NOT NULL,
  planned_pct numeric(6,2),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (baseline_id, building_id, period_date)
);

-- ── tower_scurve_actual ───────────────────────────────────────────────────────
CREATE TABLE tower_scurve_actual (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES projects(id)         ON DELETE CASCADE,
  building_id uuid        NOT NULL REFERENCES project_buildings(id) ON DELETE CASCADE,
  period_date date        NOT NULL,
  actual_pct  numeric(6,2),
  updated_at  timestamptz,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (project_id, building_id, period_date)
);

-- ── tower_scurve_forecast ─────────────────────────────────────────────────────
CREATE TABLE tower_scurve_forecast (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid        NOT NULL REFERENCES projects(id)         ON DELETE CASCADE,
  building_id  uuid        NOT NULL REFERENCES project_buildings(id) ON DELETE CASCADE,
  period_date  date        NOT NULL,
  forecast_pct numeric(6,2),
  updated_at   timestamptz,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (project_id, building_id, period_date)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE tower_scurve_baseline_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE tower_scurve_actual        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tower_scurve_forecast      ENABLE ROW LEVEL SECURITY;

-- baseline data: read all authenticated, write admin only
CREATE POLICY "tower_baseline_data_read"  ON tower_scurve_baseline_data
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "tower_baseline_data_write" ON tower_scurve_baseline_data
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- actual: read all authenticated, write all authenticated
CREATE POLICY "tower_actual_read"  ON tower_scurve_actual
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "tower_actual_write" ON tower_scurve_actual
  FOR ALL USING (auth.role() = 'authenticated');

-- forecast: read all authenticated, write all authenticated
CREATE POLICY "tower_forecast_read"  ON tower_scurve_forecast
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "tower_forecast_write" ON tower_scurve_forecast
  FOR ALL USING (auth.role() = 'authenticated');
