-- =============================================================================
-- Wrenchy migration: two-step recovery codes and the post-recovery hold
-- Date:    25 September 2026
-- Additive only - safe to apply before the matching app code.
--
-- Recovery codes let someone who has lost their authenticator get back in
-- with their password plus one single-use code. Anyone holding a stolen
-- password will try the same door, so a recovery also starts a 48-hour
-- security hold during which:
--   * banking details cannot be added or changed (RLS)
--   * no payout can be created for that pro (trigger - it also stops the
--     service role, which the payout code uses and which bypasses RLS)
-- Taking over an account and redirecting its payouts is the classic
-- marketplace fraud; the hold gives the real owner time to notice.
-- =============================================================================

begin;

-- ---- recovery codes: server-only ------------------------------------------
-- Stored as scrypt hashes. No policies and no grants: only the service role
-- (server code) can read or write this table.
create table if not exists public.mfa_recovery_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   text not null,
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);
create index if not exists mfa_recovery_codes_user_idx on public.mfa_recovery_codes (user_id) where used_at is null;
alter table public.mfa_recovery_codes enable row level security;
revoke all on public.mfa_recovery_codes from anon, authenticated;

-- ---- per-account security state --------------------------------------------
-- The owner may read it (to see their own hold); only the server writes it.
-- Kept off public.users on purpose: users can update their own row there.
create table if not exists public.account_security (
  user_id                     uuid primary key references auth.users(id) on delete cascade,
  mfa_reset_at                timestamptz,
  recovery_failures           integer not null default 0,
  recovery_window_started_at  timestamptz,
  updated_at                  timestamptz not null default now()
);
alter table public.account_security enable row level security;
revoke all on public.account_security from anon;
revoke insert, update, delete on public.account_security from authenticated;

drop policy if exists account_security_owner_read on public.account_security;
create policy account_security_owner_read on public.account_security for select
  using (user_id = auth.uid());

-- ---- the hold ----------------------------------------------------------------
create or replace function public.security_hold_until(p_user_id uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select mfa_reset_at + interval '48 hours'
  from public.account_security
  where user_id = p_user_id and mfa_reset_at > now() - interval '48 hours';
$$;
-- Takes an arbitrary user id, so it stays off the REST API.
revoke execute on function public.security_hold_until(uuid) from public, anon, authenticated;

-- For RLS: answers only about the caller.
create or replace function public.my_security_hold() returns boolean
language sql stable security definer set search_path = public as $$
  select public.security_hold_until(auth.uid()) is not null;
$$;
-- Supabase grants new functions to anon explicitly, so name it here too:
-- revoking from PUBLIC alone leaves guests able to call it.
revoke execute on function public.my_security_hold() from public, anon;
grant execute on function public.my_security_hold() to authenticated;

-- Banking details: no adding or changing during a hold.
drop policy if exists pro_payout_accounts_owner_insert on public.pro_payout_accounts;
create policy pro_payout_accounts_owner_insert on public.pro_payout_accounts for insert
  with check (public.is_my_pro_profile(pro_id) and not public.my_security_hold());

drop policy if exists pro_payout_accounts_owner_update on public.pro_payout_accounts;
create policy pro_payout_accounts_owner_update on public.pro_payout_accounts for update
  using (public.is_my_pro_profile(pro_id))
  with check (public.is_my_pro_profile(pro_id) and not public.my_security_hold());

-- Payouts: refused for a held pro, whoever is asking.
create or replace function public.block_payout_during_hold() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  hold_until timestamptz;
begin
  select public.security_hold_until(pp.user_id) into hold_until
  from public.pro_profiles pp where pp.id = new.pro_id;
  if hold_until is not null then
    raise exception 'payouts to this pro are paused until % after a two-step verification reset', hold_until
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.block_payout_during_hold() from public, anon, authenticated;

drop trigger if exists payouts_block_during_hold on public.payouts;
create trigger payouts_block_during_hold
  before insert on public.payouts
  for each row execute function public.block_payout_during_hold();

commit;
