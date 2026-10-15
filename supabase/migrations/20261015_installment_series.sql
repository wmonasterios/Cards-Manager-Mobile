-- Installments ("cuotas") as a mark on a transaction, not a category (Oct 2026).
--   plan_source:   where `plan` came from — 'statement' (the reader), 'detected'
--                  (merchant text or continuing a series), 'manual' (the user),
--                  'none' (the user said "this is not a cuota").
--   plan_group:    one id shared by every cuota of a series and, when the user
--                  marked it, the original purchase that was moved to cuotas.
--   plan_original: the original purchase ("La pasé a cuotas"); it is excluded
--                  from spend so the purchase isn't counted twice.
alter table public.transactions
  add column if not exists plan_source text check (plan_source in ('statement', 'detected', 'manual', 'none')),
  add column if not exists plan_group uuid,
  add column if not exists plan_original boolean not null default false;
create index if not exists transactions_plan_group on public.transactions (user_id, plan_group) where plan_group is not null;

update public.transactions set plan_source = 'statement' where plan is not null and plan_source is null;

-- One group per existing series: same card, same amount, same merchant start.
with s as (
  select id, card_id, amount, left(regexp_replace(upper(merchant), '[^A-Z0-9]', '', 'g'), 8) k
  from public.transactions where plan is not null and plan_group is null
), g as (
  select card_id, amount, k, gen_random_uuid() gid from s group by 1, 2, 3
)
update public.transactions t set plan_group = g.gid
from s join g using (card_id, amount, k)
where t.id = s.id;

-- The last cuota often differs by a few cents ("160.69" after two "160.40"),
-- which split one series into two groups above: merge groups on the same card
-- and merchant start, with the same number of cuotas and amounts within 1%.
with s as (
  select plan_group g, card_id, left(regexp_replace(upper(merchant), '[^A-Z0-9]', '', 'g'), 8) k,
         split_part(plan, '/', 2)::int total, avg(amount) amt, min(occurred_on) first
  from public.transactions where plan ~ '^\d{1,3}/\d{1,3}$' and not plan_original
  group by 1, 2, 3, 4
), pairs as (
  select b.g from_g, a.g to_g
  from s a join s b on a.card_id = b.card_id and a.k = b.k and a.total = b.total and a.g <> b.g
   and abs(a.amt - b.amt) <= greatest(1, abs(a.amt) * 0.01) and a.first < b.first
)
update public.transactions t set plan_group = p.to_g from pairs p where t.plan_group = p.from_g;
