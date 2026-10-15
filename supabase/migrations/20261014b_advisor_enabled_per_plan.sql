-- The advisor is on for everyone by default (owner's call, 14 Oct 2026, for
-- version 1). plans.advisor_enabled is the kill switch per plan; an
-- advisor_access row, when present, still overrides it for that one user
-- (enabled = false blocks them, true lets them in regardless of plan).
alter table public.plans add column if not exists advisor_enabled boolean not null default true;
