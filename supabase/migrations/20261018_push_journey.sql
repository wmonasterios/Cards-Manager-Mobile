-- New-user push journey (Oct 2026): server-sent nudges toward the main
-- milestones (first statement, auto-forwarding, second card, first advisor
-- question, habit) plus monthly due-day and after-cutoff reminders.
-- The logic lives in the push-journey edge function; this file adds the
-- send log, the per-user opt-out flags and the hourly schedule hook.

-- Mirrors of the app's notification toggles so the server can respect them
-- (the push token alone can't tell us the person turned a toggle off).
alter table public.profiles add column if not exists push_reminders boolean not null default true;
alter table public.profiles add column if not exists push_updates boolean not null default true;
comment on column public.profiles.push_reminders is
  'App toggle "Payment reminders". Gates server due-day / after-cutoff pushes.';
comment on column public.profiles.push_updates is
  'App toggle "New statement arrived". Gates server journey nudges.';

-- One row per push the server sent (or tried to). Unique per user + kind +
-- ref so a nudge never repeats; monthly kinds use the card + date as ref.
create table if not exists public.push_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  ref text not null default '',
  title text,
  body text,
  status text not null default 'sent',   -- sent | error
  error text,
  sent_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create index if not exists push_log_user_sent on public.push_log (user_id, sent_at desc);
alter table public.push_log enable row level security;
-- No policies: only the service role (edge functions, SQL editor) reads or writes it.
revoke all on public.push_log from anon, authenticated;

create or replace function private.invoke_push_journey(dry_run boolean default false)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_secret is null then
    raise exception 'cron_secret missing from Vault';
  end if;
  return net.http_post(
    url := 'https://glteomfpqyguzctdopsp.supabase.co/functions/v1/push-journey',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('dryRun', dry_run),
    timeout_milliseconds := 60000
  );
end $$;
revoke all on function private.invoke_push_journey(boolean) from public, anon, authenticated;

-- ACTIVATION (after the app OTA that syncs push_reminders / push_updates):
--   select cron.schedule('push-journey', '5 14-23,0,1 * * *',
--     $$select private.invoke_push_journey()$$);
-- Hourly 09:05–20:05 Panama (UTC-5). The function also refuses to send
-- outside 09:00–20:00 Panama.

-- Tap tracking (added the same day): the push carries its push_log id and
-- the app calls mark_push_opened() when the person taps it.
alter table public.push_log add column if not exists opened_at timestamptz;
create or replace function public.mark_push_opened(p_id bigint)
returns void language sql security definer set search_path = '' as $$
  update public.push_log set opened_at = coalesce(opened_at, now())
  where id = p_id and user_id = (select auth.uid())
$$;
revoke all on function public.mark_push_opened(bigint) from public, anon;
grant execute on function public.mark_push_opened(bigint) to authenticated;
