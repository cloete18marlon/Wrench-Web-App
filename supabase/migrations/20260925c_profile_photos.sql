-- =============================================================================
-- Wrenchy migration: profile photos
-- Date:    25 September 2026
-- Additive only - safe to apply before or after the matching app code.
--
--   * avatars bucket: 2 MB cap, JPEG/PNG/WebP only. Files are served by public
--     URL (the bucket is public), so no public SELECT policy is needed - and
--     leaving it out stops anyone listing every user's folder through the
--     storage API. Owners get SELECT on their own folder because Storage
--     needs it to delete.
--   * Writes confined to a folder named for the uploader's user id, the same
--     pattern as DL-017.
--   * pro_profiles.avatar_url: the photo shown in the public directory.
--     Constrained to Supabase Storage avatar URLs, so a pro can't point their
--     public photo at an arbitrary site (tracking pixels, offensive images).
--
-- The app resizes photos to 512 px in the browser before upload. Re-encoding
-- through a canvas also strips EXIF, including GPS coordinates that phone
-- cameras embed - which on a tradesperson's photo is often their home.
-- =============================================================================

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "own folder read avatars" on storage.objects;
create policy "own folder read avatars" on storage.objects for select
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own folder upload avatars" on storage.objects;
create policy "own folder upload avatars" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own folder delete avatars" on storage.objects;
create policy "own folder delete avatars" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

alter table public.pro_profiles add column if not exists avatar_url text;

alter table public.pro_profiles drop constraint if exists pro_profiles_avatar_url_storage_only;
alter table public.pro_profiles add constraint pro_profiles_avatar_url_storage_only
  check (avatar_url is null
         or avatar_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/');

-- Column-level grant (see 20260925_guest_directory_and_pro_privacy.sql):
-- new pro_profiles columns are private until listed here.
grant select (avatar_url) on public.pro_profiles to anon, authenticated;

commit;
