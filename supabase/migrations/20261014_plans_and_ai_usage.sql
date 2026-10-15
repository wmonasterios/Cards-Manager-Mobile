-- Freemium groundwork (Oct 2026). Nobody pays yet: everyone is on 'free',
-- and the free plan has no limits that bite today except the advisor's
-- monthly questions. The point is that a future Pro plan only needs rows
-- changed here, not a new app build.

-- 1. Plans and what each allows. NULL = no limit.
create table if not exists public.plans (
  id text primary key,
  advisor_monthly_limit integer,
  advisor_daily_limit integer,
  max_cards integer,
  history_months integer
);
insert into public.plans (id, advisor_monthly_limit, advisor_daily_limit, max_cards, history_months) values
  ('free', 5, 5, null, null),
  ('pro', 100, 20, null, null)
on conflict (id) do nothing;
alter table public.plans enable row level security;
drop policy if exists "plans: read" on public.plans;
create policy "plans: read" on public.plans for select to authenticated using (true);

-- 2. Each user's plan. Only the server (service role / SQL editor) may change
-- it: the existing "update own profile" policy would otherwise let anyone
-- make themselves Pro.
alter table public.profiles
  add column if not exists plan text not null default 'free' references public.plans(id),
  add column if not exists plan_until timestamptz,
  add column if not exists plan_source text;

create or replace function public.guard_profile_plan() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.plan is distinct from old.plan
          or new.plan_until is distinct from old.plan_until
          or new.plan_source is distinct from old.plan_source) then
    raise exception 'plan can only be changed by the server';
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_plan on public.profiles;
create trigger guard_profile_plan before update on public.profiles
  for each row execute function public.guard_profile_plan();

-- The plan in effect right now (an expired Pro falls back to free).
create or replace function public.effective_plan(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when p.plan <> 'free' and (p.plan_until is null or p.plan_until > now()) then p.plan else 'free' end
  from public.profiles p where p.id = uid
$$;

-- 3. AI cost per call, to learn what each user costs (statement reading is
-- the main cost). Written only by edge functions with the service role.
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,               -- 'parse' | 'reread' | 'email_parse'
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  statement_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_created on public.ai_usage (user_id, created_at);
alter table public.ai_usage enable row level security; -- no client policies

-- USD per million tokens. Verify against
-- https://platform.claude.com/docs/en/about-claude/pricing and edit rows here.
create table if not exists public.model_prices (
  model text primary key,
  input numeric not null,
  output numeric not null,
  cache_write numeric not null default 0,
  cache_read numeric not null default 0
);
insert into public.model_prices values
  ('claude-sonnet-5', 2, 10, 2.5, 0.1),
  ('claude-sonnet-5-5', 2, 10, 2.5, 0.1),
  ('claude-haiku-5-5', 0.1, 0.5, 0.125, 0.01)
on conflict (model) do nothing;
alter table public.model_prices enable row level security; -- server only

-- 4. Owner-only metrics, for the SQL editor (not exposed to the app).
create or replace view public.user_metrics with (security_invoker = true) as
select
  p.id as user_id,
  p.created_at as signed_up,
  public.effective_plan(p.id) as plan,
  (select count(*) from public.cards c where c.user_id = p.id) as cards,
  (select count(*) from public.statements s where s.user_id = p.id and s.status = 'applied') as statements,
  (select count(*) from public.statements s where s.user_id = p.id and s.received_at > now() - interval '30 days') as statements_30d,
  (select count(*) from public.advisor_usage a where a.user_id = p.id and a.created_at > now() - interval '30 days') as advisor_questions_30d,
  coalesce((select round(sum(a.cost_usd), 4) from public.advisor_usage a where a.user_id = p.id and a.created_at > now() - interval '30 days'), 0) as advisor_cost_30d,
  coalesce((select round(sum((u.input_tokens * m.input + u.output_tokens * m.output + u.cache_write_tokens * m.cache_write + u.cache_read_tokens * m.cache_read) / 1e6), 4)
            from public.ai_usage u join public.model_prices m on m.model = u.model
            where u.user_id = p.id and u.created_at > now() - interval '30 days'), 0) as reading_cost_30d
from public.profiles p;
revoke all on public.user_metrics from anon, authenticated;

-- 5. The owner keeps the advisor without the free cap.
update public.profiles set plan = 'pro', plan_source = 'owner'
where id in (select user_id from public.advisor_access where enabled);

-- 6. Advisor limits now come from the plan; advisor_access keeps the on/off
-- switch and, only if set, a per-user override of the plan's limits.
alter table public.advisor_access
  alter column monthly_limit drop not null,
  alter column monthly_limit drop default,
  alter column daily_limit drop not null,
  alter column daily_limit drop default;
update public.advisor_access set monthly_limit = null, daily_limit = null;
