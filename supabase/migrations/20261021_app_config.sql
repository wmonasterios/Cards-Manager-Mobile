-- App-wide settings the app reads at runtime (one row).
--
-- important_update_after: an OTA update created at or after this moment is
-- "important": a device still running an older bundle shows the
-- "Hay una versión más reciente de Poquet · Actualizar / Ahora no" banner
-- (src/components/UpdateBanner.tsx) once that update is downloaded. Every
-- other update applies silently (at launch, or on the next cold start).
-- To flag a release, right after publishing it:
--   update public.app_config set important_update_after = now(), updated_at = now() where id = 1;
-- NULL = no update is flagged.
create table if not exists public.app_config (
  id smallint primary key default 1 check (id = 1),
  important_update_after timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.app_config (id) values (1) on conflict (id) do nothing;

alter table public.app_config enable row level security;

-- Readable by anyone (it holds no user data); written only by the server
-- (service role / SQL editor), so no insert/update/delete policies.
create policy "app_config readable" on public.app_config
  for select to anon, authenticated using (true);

grant select on public.app_config to anon, authenticated;
-- RLS already blocks writes (no write policies); drop the default grants too.
revoke insert, update, delete, truncate on public.app_config from anon, authenticated;
