-- Quality Observation Reports (Quality Assurance tab).
-- Mirrors project_ncr_reports; kept as its own table so the two report types
-- can diverge independently.

CREATE TABLE IF NOT EXISTS project_qor_reports (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_code       text,
  qor_ref_no         text,
  project_name       text,
  contract_work_pkg  text,
  contract_scope     text,
  project_location   text,
  date_of_inspection date,
  description        text,
  root_cause         text,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  data               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by         uuid REFERENCES auth.users,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qor_reports_project_idx ON project_qor_reports(project_id);
CREATE INDEX IF NOT EXISTS qor_reports_ref_idx     ON project_qor_reports(qor_ref_no);
CREATE INDEX IF NOT EXISTS qor_reports_status_idx  ON project_qor_reports(status);

ALTER TABLE project_qor_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qor_select ON project_qor_reports;
CREATE POLICY qor_select ON project_qor_reports
  FOR SELECT USING (is_ho_user());

DROP POLICY IF EXISTS qor_insert ON project_qor_reports;
CREATE POLICY qor_insert ON project_qor_reports
  FOR INSERT WITH CHECK (has_any_role(ARRAY['admin','head','reporter','endorser']));

DROP POLICY IF EXISTS qor_update ON project_qor_reports;
CREATE POLICY qor_update ON project_qor_reports
  FOR UPDATE USING (has_any_role(ARRAY['admin','head','reporter','endorser']));

DROP POLICY IF EXISTS qor_delete ON project_qor_reports;
CREATE POLICY qor_delete ON project_qor_reports
  FOR DELETE USING (has_any_role(ARRAY['admin','head','reporter','endorser']));

-- Dedicated bucket for QOR evidence photos.
insert into storage.buckets (id, name, public)
  values ('qor-photos', 'qor-photos', true)
  on conflict (id) do update set public = true;

drop policy if exists "Authenticated users can upload qor photos" on storage.objects;
create policy "Authenticated users can upload qor photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'qor-photos');

drop policy if exists "Authenticated users can update qor photos" on storage.objects;
create policy "Authenticated users can update qor photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'qor-photos');

drop policy if exists "Public can read qor photos" on storage.objects;
create policy "Public can read qor photos"
  on storage.objects for select
  to public
  using (bucket_id = 'qor-photos');

drop policy if exists "Authenticated users can delete qor photos" on storage.objects;
create policy "Authenticated users can delete qor photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'qor-photos');
