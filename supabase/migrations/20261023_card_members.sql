-- Additional cards (22 Oct 2026). A statement can hold several card numbers
-- (the main card, additional cards, an old number that was renewed). Every
-- transaction keeps the last 4 digits of the section it was printed under
-- (transactions.card_last4, filled by the reader). card_members says, per card
-- and number, whether it's the principal's (default) or an additional's, and
-- the name the USER gave it (never the name printed on the statement).
-- A number with no row counts as principal; a row with kind 'principal'
-- only records that the user already answered, so the app stops asking.
alter table public.transactions add column if not exists card_last4 text;

create table if not exists public.card_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  last4 text not null check (last4 ~ '^[0-9]{4}$'),
  kind text not null default 'principal' check (kind in ('principal', 'additional')),
  name text check (name is null or char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (card_id, last4),
  check (kind = 'principal' or name is not null)
);

create index if not exists card_members_user on public.card_members (user_id);

alter table public.card_members enable row level security;

create policy "own card members select" on public.card_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own card members insert" on public.card_members
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.cards c where c.id = card_id and c.user_id = (select auth.uid()))
  );
create policy "own card members update" on public.card_members
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own card members delete" on public.card_members
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.card_members to authenticated;
