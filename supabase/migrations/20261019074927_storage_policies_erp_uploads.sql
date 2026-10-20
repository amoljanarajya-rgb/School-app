/*
# Storage policies for erp-uploads bucket

Allows anon + authenticated to read, insert, update, delete objects in the
erp-uploads bucket. Single-tenant app, all uploads are shared.
*/

drop policy if exists "public_read_erp_uploads" on storage.objects;
create policy "public_read_erp_uploads" on storage.objects
  for select to anon, authenticated using (bucket_id = 'erp-uploads');

drop policy if exists "anon_insert_erp_uploads" on storage.objects;
create policy "anon_insert_erp_uploads" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'erp-uploads');

drop policy if exists "anon_update_erp_uploads" on storage.objects;
create policy "anon_update_erp_uploads" on storage.objects
  for update to anon, authenticated using (bucket_id = 'erp-uploads');

drop policy if exists "anon_delete_erp_uploads" on storage.objects;
create policy "anon_delete_erp_uploads" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'erp-uploads');
