-- =============================================================================
-- Wrenchy migration: guest directory + pro privacy
-- Date:    25 September 2026
-- Apply:   staging first, AFTER the matching app code is merged and deployed
--          (the old banking page reads pro_profiles.payout_details, which this
--          migration drops). Production only once staging passes the checks at
--          the bottom of this file.
--
-- Fixes three problems found by audit on 25 Sep 2026, and prepares the
-- database for signed-out browsing of the pro directory:
--
--   1. pro_profiles.payout_details (bank details) was readable by anyone
--      holding the publishable key, via pro_profiles_public_read.
--      -> moved to pro_payout_accounts, owner-only, no public read at all.
--
--   2. pro_profiles.location (exact coordinates, often a pro's home) was
--      readable by anyone.
--      -> column SELECT revoked from anon/authenticated. Distance will be
--         computed server-side when radius search lands (Week 11).
--
--   3. pro_profiles_owner_update let a pro change their own verification_tier,
--      i.e. self-award any badge.
--      -> BEFORE UPDATE guard: only admins or the service role may change it.
--
--   4. Every non-deleted pro profile, including unapproved applicants, was
--      public. -> public sees tier >= 1 only; owner and admin see their own/all.
--
--   5. Guests cannot read public.users, so a directory had no name to show.
--      -> pro_profiles.display_name, the name a pro trades under.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Bank details: own table, owner-only
-- -----------------------------------------------------------------------------
create table if not exists public.pro_payout_accounts (
  pro_id          uuid primary key references public.pro_profiles(id) on delete cascade,
  account_holder  text not null,
  bank_name       text not null,
  account_number  text not null,
  branch_code     text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- The ensure_rls event trigger (DL-016) enables this automatically; stated
-- explicitly so the migration is correct even where that trigger is absent.
alter table public.pro_payout_accounts enable row level security;

-- Guests have no business near this table at any layer.
revoke all on public.pro_payout_accounts from anon;

create policy pro_payout_accounts_owner_read
  on public.pro_payout_accounts for select
  using (public.is_my_pro_profile(pro_id));

create policy pro_payout_accounts_owner_insert
  on public.pro_payout_accounts for insert
  with check (public.is_my_pro_profile(pro_id));

create policy pro_payout_accounts_owner_update
  on public.pro_payout_accounts for update
  using (public.is_my_pro_profile(pro_id))
  with check (public.is_my_pro_profile(pro_id));

-- No admin policy on purpose: payouts read this with the service role, and
-- no browser session - admin included - needs to see a pro's account number.

create trigger pro_payout_accounts_set_updated_at
  before update on public.pro_payout_accounts
  for each row execute function public.set_updated_at();

-- Carry over anything already saved (0 rows on staging at time of writing).
insert into public.pro_payout_accounts (pro_id, account_holder, bank_name, account_number, branch_code)
select id,
       payout_details ->> 'accountHolder',
       payout_details ->> 'bankName',
       payout_details ->> 'accountNumber',
       payout_details ->> 'branchCode'
from public.pro_profiles
where payout_details ->> 'accountNumber' is not null
on conflict (pro_id) do nothing;

alter table public.pro_profiles drop column if exists payout_details;

-- -----------------------------------------------------------------------------
-- 5. Public-facing name
-- -----------------------------------------------------------------------------
alter table public.pro_profiles add column if not exists display_name text;

update public.pro_profiles p
set display_name = u.full_name
from public.users u
where u.id = p.user_id and p.display_name is null;

-- -----------------------------------------------------------------------------
-- 2. Column-level read access: everything except location
-- -----------------------------------------------------------------------------
-- A table-level SELECT grant covers every column, so it has to go before a
-- column list can take effect. Consequence worth knowing: any column added to
-- pro_profiles later is NOT readable by clients until it is added here. That
-- is deliberate - new columns start private.
revoke select on public.pro_profiles from anon, authenticated;
grant select (
  id, user_id, display_name, company_name, bio, hourly_rate,
  service_radius_km, verification_tier, created_at, updated_at, deleted_at
) on public.pro_profiles to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Who can see which profiles
-- -----------------------------------------------------------------------------
drop policy if exists pro_profiles_public_read on public.pro_profiles;

create policy pro_profiles_public_read
  on public.pro_profiles for select
  using (deleted_at is null and verification_tier >= 1);

create policy pro_profiles_owner_read
  on public.pro_profiles for select
  using (user_id = auth.uid());

create policy pro_profiles_admin_read
  on public.pro_profiles for select
  using (public.has_role('admin'));

-- -----------------------------------------------------------------------------
-- 3. Only admins or the service role may change verification_tier
-- -----------------------------------------------------------------------------
create or replace function public.guard_verification_tier()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  request_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if new.verification_tier is distinct from old.verification_tier
     and request_role in ('anon', 'authenticated')
     and not public.has_role('admin')
  then
    raise exception 'verification_tier can only be changed by an administrator'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Trigger-only helper: not callable over REST (consistent with DL-015).
revoke execute on function public.guard_verification_tier() from public, anon, authenticated;

drop trigger if exists pro_profiles_guard_verification_tier on public.pro_profiles;
create trigger pro_profiles_guard_verification_tier
  before update on public.pro_profiles
  for each row execute function public.guard_verification_tier();

commit;

-- =============================================================================
-- Verification - run after applying. Every row should read true.
-- =============================================================================
-- select 'payout column gone',
--        not exists (select 1 from information_schema.columns
--                    where table_schema='public' and table_name='pro_profiles'
--                      and column_name='payout_details')
-- union all select 'anon cannot read location',
--        not has_column_privilege('anon','public.pro_profiles','location','SELECT')
-- union all select 'anon can read display_name',
--        has_column_privilege('anon','public.pro_profiles','display_name','SELECT')
-- union all select 'anon has no rights on payout accounts',
--        not has_table_privilege('anon','public.pro_payout_accounts','SELECT')
-- union all select 'payout accounts: rls on',
--        (select relrowsecurity from pg_class where oid='public.pro_payout_accounts'::regclass)
-- union all select 'tier guard armed',
--        exists (select 1 from pg_trigger
--                where tgname='pro_profiles_guard_verification_tier' and tgenabled='O');
