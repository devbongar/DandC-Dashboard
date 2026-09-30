-- Quality Findings (NCR) access for the site team.
--
-- Until now SELECT required is_ho_user(), so site-team users could not see the
-- Quality Assurance tab at all -- even though the write policies already
-- allowed their role. Site reporters and endorsers raise the findings in the
-- field, and site reviewers/viewers need to follow them, so reading is open to
-- any signed-in user of either team.
--
-- Resulting access:
--   read  : every signed-in user (both teams, all roles)
--   write : admin, head, reporter, endorser (either team)

DROP POLICY IF EXISTS ncr_select ON project_ncr_reports;
CREATE POLICY ncr_select ON project_ncr_reports
  FOR SELECT TO authenticated USING (true);

-- The ncr-photos bucket was open to every authenticated user, which let roles
-- that cannot write a report still upload and delete its evidence photos.
-- Match the table's write policy. Reads stay public: the app renders photos
-- from public URLs.

drop policy if exists "Authenticated users can upload ncr photos" on storage.objects;
create policy "Authenticated users can upload ncr photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'ncr-photos' AND has_any_role(ARRAY['admin','head','reporter','endorser']));

drop policy if exists "Authenticated users can update ncr photos" on storage.objects;
create policy "Authenticated users can update ncr photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'ncr-photos' AND has_any_role(ARRAY['admin','head','reporter','endorser']));

drop policy if exists "Authenticated users can delete ncr photos" on storage.objects;
create policy "Authenticated users can delete ncr photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'ncr-photos' AND has_any_role(ARRAY['admin','head','reporter','endorser']));
