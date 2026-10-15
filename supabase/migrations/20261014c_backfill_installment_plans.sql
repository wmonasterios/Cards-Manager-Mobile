-- One-off data fix (Oct 2026): installments ("cuotas") the reader left
-- without `plan`, so budgets counted them as spending or as fees.
-- apply-statement now does the same for new statements.

-- 1. Number written in the merchant text: "DAVIBANK 6% (PLACUOTA:03/48)".
update public.transactions
set plan = (regexp_match(merchant, '(?:T?CUOTA|PLACUOTA)\s*:?\s*(\d{1,3})\s*/\s*(\d{1,3})', 'i'))[1]
        || '/' || (regexp_match(merchant, '(?:T?CUOTA|PLACUOTA)\s*:?\s*(\d{1,3})\s*/\s*(\d{1,3})', 'i'))[2]
where plan is null and amount < 0
  and merchant ~* '(T?CUOTA|PLACUOTA)\s*:?\s*\d{1,3}\s*/\s*\d{1,3}';

-- 2. Same card, same amount, same merchant (first 8-12 normalized chars) as a
-- line already marked n/total → n ± months elapsed. Forward and backward;
-- run a few rounds so chains with several unmarked months fill in.
create or replace function pg_temp.norm(m text) returns text language sql immutable as
$$ select regexp_replace(upper(coalesce(m, '')), '[^A-Z0-9]', '', 'g') $$;
create or replace function pg_temp.months(a date, b date) returns int language sql immutable as
$$ select ((extract(year from b) - extract(year from a)) * 12 + extract(month from b) - extract(month from a))::int $$;

do $$
declare i int;
begin
  for i in 1..6 loop
    with cand as (
      select distinct on (t.id) t.id,
        split_part(p.plan, '/', 1)::int + pg_temp.months(p.occurred_on, t.occurred_on) as n,
        split_part(p.plan, '/', 2)::int as total,
        length(split_part(p.plan, '/', 1)) as pad
      from public.transactions t
      join public.transactions p
        on p.card_id = t.card_id and p.plan ~ '^\d{1,3}/\d{1,3}$'
       and p.amount = t.amount and p.id <> t.id
       and pg_temp.months(p.occurred_on, t.occurred_on) <> 0
       and left(pg_temp.norm(p.merchant), least(length(pg_temp.norm(p.merchant)), length(pg_temp.norm(t.merchant)), 12))
         = left(pg_temp.norm(t.merchant), least(length(pg_temp.norm(p.merchant)), length(pg_temp.norm(t.merchant)), 12))
       and least(length(pg_temp.norm(p.merchant)), length(pg_temp.norm(t.merchant)), 12) >= 8
      where t.plan is null and t.amount < 0
      order by t.id, abs(pg_temp.months(p.occurred_on, t.occurred_on))
    )
    update public.transactions t
    set plan = lpad(c.n::text, c.pad, '0') || '/' || c.total
    from cand c
    where t.id = c.id and c.n between 1 and c.total;
    exit when not found;
  end loop;
end $$;

-- 3. One series, one category (the most common one among its lines), unless
-- the user picked a category by hand.
with s as (
  select id, card_id, amount, left(pg_temp.norm(merchant), 8) k, category, category_source
  from public.transactions where plan is not null and amount < 0
), top as (
  select distinct on (card_id, amount, k) card_id, amount, k, category
  from (select card_id, amount, k, category, count(*) n from s group by 1, 2, 3, 4) x
  order by card_id, amount, k, n desc
)
update public.transactions t
set category = top.category
from s join top using (card_id, amount, k)
where t.id = s.id and s.category_source not in ('manual', 'override')
  and s.category is distinct from top.category;
