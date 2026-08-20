-- Allow all authenticated users to read app_settings (needed for logo URLs etc.)
DROP POLICY IF EXISTS appsettings_select ON app_settings;
CREATE POLICY appsettings_select ON app_settings FOR SELECT USING (auth.role() = 'authenticated');
