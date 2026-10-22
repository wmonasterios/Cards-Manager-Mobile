-- support_reports: what users send from "Reportar un error" (Settings, the
-- statement review screen and the statement detail). Written only by the
-- submit-report edge function (service role), which also emails
-- support@poquetapp.com. Users can read their own reports; nobody can write
-- them directly from the app.
create table if not exists public.support_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  area text not null check (area in ('parsing', 'balances', 'instalments', 'reminders', 'other')),
  message text not null check (char_length(message) between 1 and 4000),
  -- The statement the report is about; NULL when the user didn't allow a review.
  statement_id uuid references public.statements (id) on delete set null,
  allow_review boolean not null default false,
  source text not null default 'settings' check (source in ('settings', 'review', 'statement')),
  app_version text,
  update_id text,
  platform text,
  os_version text,
  lang text,
  status text not null default 'new' check (status in ('new', 'seen', 'fixed', 'wontfix')),
  emailed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists support_reports_user_created on public.support_reports (user_id, created_at desc);
create index if not exists support_reports_status_created on public.support_reports (status, created_at desc);

alter table public.support_reports enable row level security;

create policy "read own support reports" on public.support_reports
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.support_reports from anon, authenticated;
grant select on public.support_reports to authenticated;
