-- Gmail forwarding confirmations: notice when Google or Mailgun change how
-- they look, instead of finding out from a user (Oct 2026: the email back
-- silently stopped for a day because Mailgun never sent the header the check
-- relied on).
--
-- receive-statement-email calls claim_ops_alert() when a mail from google.com
-- can't be read as a confirmation, a confirmation fails authentication, or
-- any other automated sender mails a forwarding address without a PDF
-- (another provider's verification, or a bank notice); it emails
-- support@poquetapp.com at most once a day per kind (per sender domain for
-- the last one, and at most every 4 h overall).

-- What happened to the latest forwarding notice, so the app's card says the
-- right thing: 'emailed' (sent back to the Gmail that asked), 'saved' (shown
-- in the app only: not authenticated as Google, or no requester),
-- 'unreadable' (mail from Google we couldn't parse), 'unrecognized' (mail
-- without a PDF from another automated sender; gmail_fwd_from then holds that
-- sender's domain). NULL = saved before this column existed.
alter table public.profiles
  add column if not exists gmail_fwd_status text
  check (gmail_fwd_status in ('emailed', 'saved', 'unreadable', 'unrecognized'));

-- One row per alert kind. Server-only: RLS on, no policies, no grants.
create table if not exists public.ops_alerts (
  kind text primary key,
  last_sent_at timestamptz,
  last_seen_at timestamptz not null default now(),
  seen_since_alert integer not null default 0
);

alter table public.ops_alerts enable row level security;
revoke all on public.ops_alerts from anon, authenticated;

-- Records one occurrence of p_kind. Returns how many occurred since the last
-- alert (this one included) when an alert is due now, or NULL when one was
-- already sent within p_every. The upsert locks the row, so concurrent calls
-- can't both claim the same alert.
create or replace function public.claim_ops_alert(p_kind text, p_every interval default interval '1 day')
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.ops_alerts;
begin
  insert into public.ops_alerts as a (kind, last_seen_at, seen_since_alert)
  values (p_kind, now(), 1)
  on conflict (kind) do update
    set last_seen_at = now(), seen_since_alert = a.seen_since_alert + 1
  returning * into v_row;

  if v_row.last_sent_at is not null and v_row.last_sent_at > now() - p_every then
    return null;
  end if;

  update public.ops_alerts set last_sent_at = now(), seen_since_alert = 0 where kind = p_kind;
  return v_row.seen_since_alert;
end
$$;

revoke execute on function public.claim_ops_alert(text, interval) from public, anon, authenticated;
grant execute on function public.claim_ops_alert(text, interval) to service_role;
