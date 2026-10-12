-- AI advisor (MVP). Every table cascades from auth.users so deleting an
-- account leaves nothing behind. The app can READ its own rows; writes that
-- matter for cost or access (access, usage) happen only server-side
-- (advisor-chat, service role), so a user can't grant themselves access or
-- erase their usage to dodge the monthly limit.

-- Who has the advisor and with what limits. No write policies: rows are
-- managed by the service role (manual during the MVP, the subscription later).
create table public.advisor_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  monthly_limit integer not null default 100,
  daily_limit integer not null default 20,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.advisor_access enable row level security;
create policy "advisor_access: read own" on public.advisor_access
  for select using (auth.uid() = user_id);

-- Explicit consent to send (minimal, non-identifying) data to the AI
-- provider. The user can give or revoke it; revoking = delete the row.
create table public.advisor_consent (
  user_id uuid primary key references auth.users(id) on delete cascade,
  consented_at timestamptz not null default now(),
  version text not null default '2026-10'
);
alter table public.advisor_consent enable row level security;
create policy "advisor_consent: read own" on public.advisor_consent
  for select using (auth.uid() = user_id);
create policy "advisor_consent: give own" on public.advisor_consent
  for insert with check (auth.uid() = user_id);
create policy "advisor_consent: revoke own" on public.advisor_consent
  for delete using (auth.uid() = user_id);

create table public.advisor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index advisor_conversations_user_idx on public.advisor_conversations (user_id, updated_at desc);
alter table public.advisor_conversations enable row level security;
create policy "advisor_conversations: read own" on public.advisor_conversations
  for select using (auth.uid() = user_id);
create policy "advisor_conversations: delete own" on public.advisor_conversations
  for delete using (auth.uid() = user_id);

create table public.advisor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.advisor_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  model text,
  rating smallint check (rating in (-1, 1)),
  created_at timestamptz not null default now()
);
create index advisor_messages_conv_idx on public.advisor_messages (conversation_id, created_at);
alter table public.advisor_messages enable row level security;
create policy "advisor_messages: read own" on public.advisor_messages
  for select using (auth.uid() = user_id);
-- Only the rating column is meant to change from the app (👍/👎).
create policy "advisor_messages: rate own" on public.advisor_messages
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Things the user asked the advisor to remember (goals, preferences, events).
create table public.advisor_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('goal', 'preference', 'event')),
  content text not null check (char_length(content) <= 280),
  created_at timestamptz not null default now()
);
create index advisor_memory_user_idx on public.advisor_memory (user_id, created_at);
alter table public.advisor_memory enable row level security;
create policy "advisor_memory: read own" on public.advisor_memory
  for select using (auth.uid() = user_id);
create policy "advisor_memory: add own" on public.advisor_memory
  for insert with check (auth.uid() = user_id);
create policy "advisor_memory: edit own" on public.advisor_memory
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "advisor_memory: delete own" on public.advisor_memory
  for delete using (auth.uid() = user_id);

-- Per-question usage and cost (one row per answered question). Read-only
-- for the user; written by advisor-chat with the service role.
create table public.advisor_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.advisor_conversations(id) on delete set null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index advisor_usage_user_idx on public.advisor_usage (user_id, created_at desc);
alter table public.advisor_usage enable row level security;
create policy "advisor_usage: read own" on public.advisor_usage
  for select using (auth.uid() = user_id);

-- Column-level guard: from the app, a message's rating is the only thing
-- that can change (never its content, role or model).
revoke update on public.advisor_messages from authenticated, anon;
grant update (rating) on public.advisor_messages to authenticated;
