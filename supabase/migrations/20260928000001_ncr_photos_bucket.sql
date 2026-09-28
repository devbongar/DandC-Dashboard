-- Dedicated bucket for NCR evidence photos (Quality Assurance tab).

insert into storage.buckets (id, name, public)
  values ('ncr-photos', 'ncr-photos', true)
  on conflict (id) do update set public = true;

drop policy if exists "Authenticated users can upload ncr photos" on storage.objects;
create policy "Authenticated users can upload ncr photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'ncr-photos');

drop policy if exists "Authenticated users can update ncr photos" on storage.objects;
create policy "Authenticated users can update ncr photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'ncr-photos');

drop policy if exists "Public can read ncr photos" on storage.objects;
create policy "Public can read ncr photos"
  on storage.objects for select
  to public
  using (bucket_id = 'ncr-photos');

drop policy if exists "Authenticated users can delete ncr photos" on storage.objects;
create policy "Authenticated users can delete ncr photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'ncr-photos');
