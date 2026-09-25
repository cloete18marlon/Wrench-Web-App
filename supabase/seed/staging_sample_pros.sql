-- =============================================================================
-- STAGING ONLY - never run against wrenchy-production.
--
-- Loads the eight sample pros from the prototype so the guest directory has
-- something to show. Safe to re-run: fixed ids, every insert is idempotent.
--
-- The accounts:
--   * use the reserved .invalid domain, so no email can ever be delivered
--   * have no password, so nobody can sign in as them
--   * are tagged raw_app_meta_data.sample = true, which the cleanup at the
--     bottom uses to remove them in one go
--
-- No reviews are seeded. A review needs a real completed job, and inventing
-- ratings - even on staging - is how fake numbers end up in a demo.
-- Requires: migration 20260925_guest_directory_and_pro_privacy.sql
-- =============================================================================

begin;

-- ---- skills (the prototype's four per trade) --------------------------------
insert into public.skills (trade_id, name)
select t.id, s.name
from (values
  ('Painting','Interior painting'),('Painting','Exterior painting'),('Painting','Wallpaper removal'),('Painting','Spray finishing'),
  ('Electrical','Rewiring'),('Electrical','COC certificates'),('Electrical','DB board upgrades'),('Electrical','Fault finding'),
  ('Plumbing','Leak repair'),('Plumbing','Geyser install'),('Plumbing','Bathroom fitting'),('Plumbing','Drain unblocking'),
  ('Carpentry','Built-in cupboards'),('Carpentry','Decking'),('Carpentry','Furniture repair'),('Carpentry','Custom shelving'),
  ('Landscaping','Garden design'),('Landscaping','Lawn maintenance'),('Landscaping','Irrigation'),('Landscaping','Tree felling'),
  ('Tiling','Floor tiling'),('Tiling','Wall tiling'),('Tiling','Paving'),('Tiling','Grouting & sealing'),
  ('Cleaning','Deep cleaning'),('Cleaning','Move-out cleaning'),('Cleaning','Window cleaning'),('Cleaning','Post-build cleanup'),
  ('Roofing','Roof leak repair'),('Roofing','Waterproofing'),('Roofing','Gutter replacement'),('Roofing','Tile & sheet roofing')
) as s(trade, name)
join public.trades t on t.name = s.trade
where not exists (
  select 1 from public.skills k where k.trade_id = t.id and k.name = s.name
);

-- ---- the eight pros ---------------------------------------------------------
create temporary table sample_pros (
  user_id uuid, pro_id uuid, full_name text, company text, trade text,
  rate numeric, tier smallint, bio text, skills text[]
) on commit drop;

insert into sample_pros values
  ('5a000000-0000-4000-8000-000000000001','5b000000-0000-4000-8000-000000000001','Thabo Nkosi','Nkosi Coatings','Painting',220,2,
   'Professional painter with 9 years'' experience in residential and commercial repaints. Meticulous prep work, clean finish, always on time.',
   array['Interior painting','Exterior painting','Wallpaper removal','Spray finishing']),
  ('5a000000-0000-4000-8000-000000000002','5b000000-0000-4000-8000-000000000002','Sipho Mahlangu','Voltway Electrical','Electrical',280,2,
   'Certified electrician handling residential rewiring, DB board upgrades and compliance certificates.',
   array['Rewiring','COC certificates','DB board upgrades','Fault finding']),
  ('5a000000-0000-4000-8000-000000000003','5b000000-0000-4000-8000-000000000003','Johan van Wyk','Van Wyk Plumbing Co.','Plumbing',240,2,
   '20+ years fixing leaks, geysers and full bathroom installs across Johannesburg.',
   array['Leak repair','Geyser install','Bathroom fitting','Drain unblocking']),
  ('5a000000-0000-4000-8000-000000000004','5b000000-0000-4000-8000-000000000004','Lindiwe Zulu','Zulu Woodcraft','Carpentry',260,1,
   'Custom carpentry: built-in cupboards, decking and furniture repair, with a focus on craftsmanship.',
   array['Built-in cupboards','Decking','Furniture repair','Custom shelving']),
  ('5a000000-0000-4000-8000-000000000005','5b000000-0000-4000-8000-000000000005','Grace Molefe','BrightLeaf Gardens','Landscaping',180,2,
   'Garden design, lawn care and irrigation setup for homes, complexes and church grounds.',
   array['Garden design','Lawn maintenance','Irrigation','Tree felling']),
  ('5a000000-0000-4000-8000-000000000006','5b000000-0000-4000-8000-000000000006','Ahmed Patel','Patel Tiling & Paving','Tiling',250,2,
   'Precision tiling and paving. Bathrooms, kitchens, driveways and patios finished to spec.',
   array['Floor tiling','Wall tiling','Paving','Grouting & sealing']),
  ('5a000000-0000-4000-8000-000000000007','5b000000-0000-4000-8000-000000000007','Precious Dlamini','SparkleHome Cleaning','Cleaning',150,2,
   'Deep cleans, move-out cleans and post-renovation cleanups. Small trusted team, own equipment.',
   array['Deep cleaning','Move-out cleaning','Window cleaning','Post-build cleanup']),
  ('5a000000-0000-4000-8000-000000000008','5b000000-0000-4000-8000-000000000008','Pieter Botha','Botha Roofing','Roofing',320,1,
   'Roof repairs, waterproofing and gutter replacement. Specialises in storm damage assessments.',
   array['Roof leak repair','Waterproofing','Gutter replacement','Tile & sheet roofing']);

-- Auth accounts. The handle_new_user trigger (DL-012) creates the matching
-- public.users row and customer role. Empty-string tokens rather than NULL:
-- Supabase Auth fails to list users when these columns are NULL.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', sp.user_id, 'authenticated', 'authenticated',
       'sample+' || lower(split_part(sp.full_name, ' ', 1)) || '@wrenchy.invalid', '', now(),
       '{"provider":"email","providers":["email"],"sample":true}'::jsonb,
       jsonb_build_object('full_name', sp.full_name),
       now(), now(), '', '', '', ''
from sample_pros sp
on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
select user_id, 'pro'::user_role_enum from sample_pros
on conflict (user_id, role) do nothing;

insert into public.pro_profiles (id, user_id, display_name, company_name, bio, hourly_rate, verification_tier)
select pro_id, user_id, full_name, company, bio, rate, tier from sample_pros
on conflict (id) do nothing;

insert into public.pro_trades (pro_id, trade_id)
select sp.pro_id, t.id
from sample_pros sp join public.trades t on t.name = sp.trade
on conflict do nothing;

insert into public.pro_skills (pro_id, skill_id)
select sp.pro_id, k.id
from sample_pros sp
join public.trades t on t.name = sp.trade
join public.skills k on k.trade_id = t.id and k.name = any (sp.skills)
on conflict do nothing;

commit;

-- =============================================================================
-- Cleanup - removes every sample pro and nothing else.
-- =============================================================================
-- begin;
-- delete from public.pro_skills  where pro_id in (select p.id from public.pro_profiles p join auth.users a on a.id = p.user_id where a.raw_app_meta_data->>'sample' = 'true');
-- delete from public.pro_trades  where pro_id in (select p.id from public.pro_profiles p join auth.users a on a.id = p.user_id where a.raw_app_meta_data->>'sample' = 'true');
-- delete from public.pro_profiles where user_id in (select id from auth.users where raw_app_meta_data->>'sample' = 'true');
-- delete from auth.users where raw_app_meta_data->>'sample' = 'true';
-- commit;
