-- Allow unauthenticated (anon) users to read logo keys from app_settings.
-- Needed so the Logo component works on login/signup/forgot-password pages
-- before the user authenticates. Logo URLs are not sensitive data.
CREATE POLICY appsettings_anon_logo_read ON app_settings
  FOR SELECT
  USING (key IN ('logo_url', 'logo_white_url'));
