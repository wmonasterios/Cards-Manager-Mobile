-- "Volver a leer" runs on the server in the background and keeps its result
-- next to the saved reading instead of replacing it, so leaving the screen or
-- the app doesn't lose it and the saved reading is never touched until the
-- user picks one.
--   reread_status: null (none) | 'reading' | 'ready' | 'failed'
alter table public.statements
  add column if not exists reread_parsed jsonb,
  add column if not exists reread_status text check (reread_status in ('reading', 'ready', 'failed')),
  add column if not exists reread_started_at timestamptz,
  add column if not exists reread_error text;
