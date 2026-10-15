-- Lock down SECURITY DEFINER functions flagged by the Supabase security advisor.

-- 1. effective_plan(uid): a signed-in user may only read their OWN plan.
--    Server code (service role, advisor-chat) and SQL run as postgres keep full access.
create or replace function public.effective_plan(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when p.plan <> 'free' and (p.plan_until is null or p.plan_until > now()) then p.plan else 'free' end
  from public.profiles p
  where p.id = uid
    and (uid = auth.uid() or coalesce(auth.role(), '') not in ('authenticated', 'anon'))
$$;
revoke execute on function public.effective_plan(uuid) from public, anon;
grant execute on function public.effective_plan(uuid) to authenticated, service_role;

-- 2. promote_confirmed_suggestions(): server-only. It is reached through
--    record_suggestion_feedback, which now runs as definer so it can call it.
revoke execute on function public.promote_confirmed_suggestions() from public, anon, authenticated;
grant execute on function public.promote_confirmed_suggestions() to service_role;

create or replace function public.record_suggestion_feedback(p_merchant_raw text, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_chain text := public.normalize_merchant_name(p_merchant_raw);
  v_suggestion_id bigint;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or v_chain is null or p_action not in ('confirm', 'reject') then
    return;
  end if;

  select id into v_suggestion_id
  from public.merchant_classification_suggestions
  where nombre_cadena = v_chain and estado = 'pendiente';

  if v_suggestion_id is null then
    return;
  end if;

  insert into public.merchant_suggestion_feedback (suggestion_id, user_id, action)
  values (v_suggestion_id, v_user_id, p_action)
  on conflict (suggestion_id, user_id) do update set action = excluded.action, created_at = now();

  perform public.promote_confirmed_suggestions();
end;
$$;
revoke execute on function public.record_suggestion_feedback(text, text) from public, anon;
grant execute on function public.record_suggestion_feedback(text, text) to authenticated, service_role;

-- 3. guard_profile_plan(): pin search_path (advisor: function_search_path_mutable).
alter function public.guard_profile_plan() set search_path = public;
