-- =============================================================================
-- Wrenchy migration: fix infinite recursion between jobs and quotes policies
-- Date:    25 September 2026
-- Applied: wrenchy-staging, 25 Sep 2026 (as fix_jobs_quotes_policy_recursion)
--
-- jobs_quoted_pro_read read quotes; quotes_participant_read read jobs. Any
-- read of jobs - including the INSERT ... RETURNING when a customer posts a
-- job - recursed, and Postgres aborted with "infinite recursion detected in
-- policy for relation jobs". Introduced by jobs_quotes_roles_rls (7 Sep);
-- surfaced the first time anyone posted a job.
--
-- Definer helpers answer the cross-table questions without re-entering RLS.
-- Each returns a boolean about the caller only - the accepted pattern from
-- DL-017 - so EXECUTE stays granted: RLS evaluates functions as the querying
-- role, and revoking it breaks the policies that call them.
--
-- Verified on staging in a rolled-back transaction: customer posts and reads
-- back a job; matching-trade pro browses and quotes; other-trade pro sees
-- neither; customer reads quote and line item and accepts; pro still sees
-- the job after it leaves 'requested'; guest sees no jobs or quotes.
-- =============================================================================

begin;

create or replace function public.is_my_job(p_job_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.jobs where id = p_job_id and customer_id = auth.uid());
$$;

create or replace function public.i_quoted_on_job(p_job_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.quotes q join public.pro_profiles pp on pp.id = q.pro_id
                 where q.job_id = p_job_id and pp.user_id = auth.uid());
$$;

create or replace function public.job_is_open(p_job_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.jobs where id = p_job_id and status = 'requested');
$$;

revoke execute on function public.is_my_job(uuid), public.i_quoted_on_job(uuid), public.job_is_open(uuid) from public;
grant execute on function public.is_my_job(uuid), public.i_quoted_on_job(uuid), public.job_is_open(uuid) to anon, authenticated;

drop policy if exists jobs_quoted_pro_read on public.jobs;
create policy jobs_quoted_pro_read on public.jobs for select
  using (public.i_quoted_on_job(id));

drop policy if exists quotes_participant_read on public.quotes;
create policy quotes_participant_read on public.quotes for select
  using (public.is_my_pro_profile(pro_id) or public.is_my_job(job_id));

drop policy if exists quotes_customer_update on public.quotes;
create policy quotes_customer_update on public.quotes for update
  using (public.is_my_job(job_id));

drop policy if exists quotes_pro_insert on public.quotes;
create policy quotes_pro_insert on public.quotes for insert
  with check (public.is_my_pro_profile(pro_id) and public.has_role('pro') and public.job_is_open(job_id));

commit;
