-- Allow authenticated users to upload/update objects in app-assets bucket
insert into storage.buckets (id, name, public)
  values ('app-assets', 'app-assets', true)
  on conflict (id) do update set public = true;

create policy "Authenticated users can upload app assets"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'app-assets');

create policy "Authenticated users can update app assets"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'app-assets');

create policy "Public can read app assets"
  on storage.objects for select
  to public
  using (bucket_id = 'app-assets');

create policy "Authenticated users can delete app assets"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'app-assets');
