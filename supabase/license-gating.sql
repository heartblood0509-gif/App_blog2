-- License Gating Migration
-- Adds per-customer plan ('blog' vs 'blog_youtube') so only YouTube-paying
-- customers can use the YouTube tab. Apply AFTER device-auth.sql and
-- admin-management.sql. Re-runnable (idempotent).
--
-- Default policy: the new `plan` column defaults to 'blog_youtube', so every
-- existing customer is YouTube-ON automatically. The owner manually turns the
-- few blog-only customers OFF via the admin console. Gate rule everywhere =
-- "only explicit 'blog' is blocked" (null / missing / 'blog_youtube' => allow).

-- ============================================================
-- 1. Schema: plan column + CHECK constraint
--    (mirrors email_entitlements_status_check, device-auth.sql:29-33)
-- ============================================================

alter table public.email_entitlements
  add column if not exists plan text not null default 'blog_youtube';

alter table public.email_entitlements
  drop constraint if exists email_entitlements_plan_check;
alter table public.email_entitlements
  add constraint email_entitlements_plan_check
  check (plan in ('blog', 'blog_youtube'));

-- ============================================================
-- 2. RPC get_my_plan() — mirrors get_my_role() (admin-management.sql:641-657)
--    profiles -> email_entitlements joined by lower(email).
--    Missing row => default allow ('blog_youtube').
-- ============================================================

create or replace function public.get_my_plan()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_plan text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'plan', null);
  end if;
  select email into v_email from public.profiles where id = v_uid;
  select plan into v_plan
  from public.email_entitlements
  where lower(email) = lower(v_email);
  return jsonb_build_object('ok', true, 'plan', coalesce(v_plan, 'blog_youtube'));
end;
$$;

-- ============================================================
-- 3. Admin RPC admin_set_user_plan(p_email, p_plan)
--    mirrors admin_set_user_role validation + audit log (310-363),
--    keyed by email like admin_update_entitlement (479-538).
--    Upserts the entitlement row when missing so turning a customer OFF
--    always takes effect (a plain UPDATE would 0-row silently fail and
--    leave them at the 'blog_youtube' default).
-- ============================================================

create or replace function public.admin_set_user_plan(
  p_email text,
  p_plan text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_profile_status text;
  v_before jsonb;
  v_after jsonb;
begin
  perform public._admin_require();

  if v_email = '' then
    raise exception 'invalid-email' using errcode = '22023';
  end if;

  if p_plan not in ('blog', 'blog_youtube') then
    raise exception 'invalid-plan: %', p_plan using errcode = '22023';
  end if;

  select to_jsonb(e) into v_before
  from public.email_entitlements e where lower(e.email) = v_email;

  if v_before is null then
    -- No entitlement row yet: create one so the plan change sticks.
    -- Mirror the profile's existing status (or 'pending' if no profile) —
    -- NEVER promote to 'active'; setting a plan must not grant access status.
    select status into v_profile_status
    from public.profiles where lower(email) = v_email
    order by created_at asc limit 1;

    insert into public.email_entitlements (email, status, plan)
    values (v_email, coalesce(v_profile_status, 'pending'), p_plan)
    on conflict (email) do update
      set plan = excluded.plan,
          updated_at = now();
  else
    update public.email_entitlements
    set plan = p_plan, updated_at = now()
    where lower(email) = v_email;
  end if;

  select to_jsonb(e) into v_after
  from public.email_entitlements e where lower(e.email) = v_email;

  perform public._admin_log('set_plan', null, v_email, v_before, v_after);

  return jsonb_build_object('ok', true, 'email', v_email, 'plan', p_plan);
end;
$$;

-- ============================================================
-- 4. Expose plan in admin_list_users() (create or replace = in-place safe).
--    Adds 'entitlement_plan' alongside the existing entitlement subselects
--    (mirrors entitlement_status subselect, 158-161).
-- ============================================================

create or replace function public.admin_list_users(p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  perform public._admin_require();

  select coalesce(jsonb_agg(row order by row->>'created_at' desc), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'id', p.id,
      'email', p.email,
      'status', p.status,
      'role', p.role,
      'created_at', p.created_at,
      'updated_at', p.updated_at,
      'device_count', (
        select count(*) from public.devices d
        where d.user_id = p.id and d.replaced_at is null
      ),
      'entitlement_status', (
        select status from public.email_entitlements e
        where lower(e.email) = lower(p.email)
      ),
      'entitlement_plan', (
        select plan from public.email_entitlements e
        where lower(e.email) = lower(p.email)
      ),
      'entitlement_note', (
        select note from public.email_entitlements e
        where lower(e.email) = lower(p.email)
      ),
      'display_name', (
        select display_name from public.email_entitlements e
        where lower(e.email) = lower(p.email)
      ),
      'memo', (
        select memo from public.email_entitlements e
        where lower(e.email) = lower(p.email)
      )
    ) as row
    from public.profiles p
    where (p_status is null or p.status = p_status)
  ) sub;

  return jsonb_build_object('ok', true, 'users', v_rows);
end;
$$;

-- ============================================================
-- 5. EXECUTE permissions (defense in depth: revoke from anon/public,
--    grant to authenticated only — mirrors admin-management.sql:663-691)
-- ============================================================

revoke all on function public.get_my_plan() from public, anon;
revoke all on function public.admin_set_user_plan(text, text) from public, anon;

grant execute on function public.get_my_plan() to authenticated;
grant execute on function public.admin_set_user_plan(text, text) to authenticated;
