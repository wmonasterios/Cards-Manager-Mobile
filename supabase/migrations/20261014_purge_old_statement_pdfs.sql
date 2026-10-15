-- Statement PDFs are deleted 90 days after upload (privacy). The extracted
-- data stays; only the original file goes. Deletion itself happens in the
-- purge-old-statement-pdfs edge function (Supabase blocks deleting Storage
-- objects with plain SQL), which this file schedules daily via pg_cron + pg_net.

alter table public.statements add column if not exists pdf_purged_at timestamptz;
comment on column public.statements.pdf_purged_at is
  'When the original PDF was deleted by the 90-day retention job (storage_path is then NULL).';

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- The shared secret lives only in Vault as `cron_secret`. It is created out
-- of band, never committed:
--   select vault.create_secret('<random hex>', 'cron_secret');

-- The edge function checks the header through this service-role-only RPC.
create or replace function public.check_cron_secret(p_secret text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'cron_secret' and decrypted_secret = p_secret)
$$;
revoke all on function public.check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.check_cron_secret(text) to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.invoke_purge_old_statement_pdfs(dry_run boolean default false)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_secret is null then
    raise exception 'cron_secret missing from Vault';
  end if;
  return net.http_post(
    url := 'https://glteomfpqyguzctdopsp.supabase.co/functions/v1/purge-old-statement-pdfs',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('dryRun', dry_run),
    timeout_milliseconds := 60000
  );
end $$;
revoke all on function private.invoke_purge_old_statement_pdfs(boolean) from public, anon, authenticated;

-- ACTIVATION (run only once the app build that handles purged PDFs is live
-- on the production channel — see AGENTS.md "Statement PDF retention"):
--   select cron.schedule('purge-old-statement-pdfs', '15 8 * * *',
--     $$select private.invoke_purge_old_statement_pdfs()$$);
-- 08:15 UTC = 03:15 Panama.
