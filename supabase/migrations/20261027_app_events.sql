-- app_events: first-party product analytics (owner's call, 27 Oct 2026) —
-- what people see and leave half done, which the rest of the database can't
-- tell (statements, advisor questions, cards and pushes are already there).
-- Written by the app through src/analytics.ts; nobody can read it from the
-- app. Event names follow PostHog's style so they can be sent there later.
--
-- Privacy: only a closed list of props per event (enforced in the app), never
-- amounts, merchants, banks, last4 or text the user typed; 500-byte cap here.
-- Rows are deleted after 12 months (daily pg_cron job below).
--
-- Before sign-in (onboarding, the auth screen, the demo) there is no user:
-- those events carry only anon_id, a random id kept on the device, so the
-- drop-off before signing up can be measured and joined to the account once
-- it exists. The anon role may insert only those event names.

create table if not exists public.app_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users (id) on delete cascade,
  anon_id uuid not null,
  event text not null check (event ~ '^[a-z][a-z_]{2,39}$'),
  props jsonb not null default '{}'::jsonb
    check (jsonb_typeof(props) = 'object' and octet_length(props::text) <= 500),
  app_version text check (char_length(app_version) <= 20),
  platform text check (platform in ('ios', 'android', 'web'))
);

create index if not exists app_events_event_created on public.app_events (event, created_at);
create index if not exists app_events_user_created on public.app_events (user_id, created_at);
create index if not exists app_events_anon on public.app_events (anon_id);

alter table public.app_events enable row level security;

revoke all on public.app_events from anon, authenticated;
grant insert (anon_id, event, props, app_version, platform) on public.app_events to anon, authenticated;

-- Signed in: only rows for yourself (user_id is filled in by its default).
create policy "insert own app events" on public.app_events
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Signed out: only the pre-sign-in events, with no user.
create policy "insert pre-auth app events" on public.app_events
  for insert to anon
  with check (
    user_id is null
    and event in ('onboarding_viewed', 'auth_viewed', 'signup_started', 'signup_failed', 'demo_entered', 'demo_exited')
  );

-- 12-month retention, daily at 03:30 Panama (right after the PDF purge).
select cron.schedule(
  'purge-old-app-events',
  '30 8 * * *',
  $$delete from public.app_events where created_at < now() - interval '12 months'$$
);
