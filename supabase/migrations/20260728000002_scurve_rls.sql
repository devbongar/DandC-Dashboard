-- Enable RLS on all new S-curve tables
ALTER TABLE project_scurve_baselines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_scurve_baseline_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_scurve_actual        ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_scurve_forecast      ENABLE ROW LEVEL SECURITY;

-- ── project_scurve_baselines ──────────────────────────────────────────────
CREATE POLICY "scurve_baselines_read" ON project_scurve_baselines
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "scurve_baselines_admin_write" ON project_scurve_baselines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── project_scurve_baseline_data ─────────────────────────────────────────
CREATE POLICY "scurve_baseline_data_read" ON project_scurve_baseline_data
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "scurve_baseline_data_admin_write" ON project_scurve_baseline_data
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── project_scurve_actual ─────────────────────────────────────────────────
-- All authenticated users can read; project team (any authenticated) can write
CREATE POLICY "scurve_actual_read" ON project_scurve_actual
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "scurve_actual_write" ON project_scurve_actual
  FOR ALL USING (auth.role() = 'authenticated');

-- ── project_scurve_forecast ───────────────────────────────────────────────
CREATE POLICY "scurve_forecast_read" ON project_scurve_forecast
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "scurve_forecast_write" ON project_scurve_forecast
  FOR ALL USING (auth.role() = 'authenticated');
