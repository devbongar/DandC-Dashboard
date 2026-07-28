-- Drop old single-table S-curve structure
DROP TABLE IF EXISTS project_scurve_pending;
DROP TABLE IF EXISTS project_scurve;

-- Baseline headers: one row per named baseline snapshot per project
CREATE TABLE project_scurve_baselines (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  cutoff_date date,
  notes       text,
  created_at  timestamptz DEFAULT now()
);

-- Baseline data points: monthly planned % per baseline
CREATE TABLE project_scurve_baseline_data (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  baseline_id  uuid NOT NULL REFERENCES project_scurve_baselines(id) ON DELETE CASCADE,
  period_date  date NOT NULL,
  planned_pct  numeric(5,2),
  UNIQUE(baseline_id, period_date)
);

-- Actual monthly progress (entered by project team)
CREATE TABLE project_scurve_actual (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  period_date date NOT NULL,
  actual_pct  numeric(5,2),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(project_id, period_date)
);

-- Forecast monthly progress (entered by project team, future periods only)
CREATE TABLE project_scurve_forecast (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  period_date  date NOT NULL,
  forecast_pct numeric(5,2),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE(project_id, period_date)
);
