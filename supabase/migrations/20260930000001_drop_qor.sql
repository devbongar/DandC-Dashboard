-- QOR (Quality Observation Report) removed from the Quality Assurance tab --
-- only the NCR/Quality Findings form remains. Drop its table and photo bucket.

DROP TABLE IF EXISTS project_qor_reports;

-- Remove the bucket's storage policies before the bucket itself
DROP POLICY IF EXISTS "Authenticated users can upload qor photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update qor photos" ON storage.objects;
DROP POLICY IF EXISTS "Public can read qor photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete qor photos" ON storage.objects;

-- Supabase blocks direct deletes on storage.objects/buckets (protect_delete
-- trigger) -- remove the qor-photos bucket and its files from the Storage
-- tab in the dashboard, or via the Storage API, instead of SQL.
