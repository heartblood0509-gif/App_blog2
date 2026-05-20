-- Admin Management Migration
-- Adds in-app admin console: role column, audit log, and admin-only RPCs.
-- Apply after device-auth.sql. Re-runnable.

-- ============================================================
-- 1. Schema changes
-- ============================================================

alter table public.profiles
  add column if not exists role text not null default 'user'
    check (role in ('user', 'admin'));

create table if not exists public.admin_audit_log (
  id bigserial primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  target_user_id uuid,
  target_email text,
  action text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

-- ============================================================
-- 2. Admin guard helper
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ============================================================
-- 3. RLS policies (admin-wide read access)
-- ============================================================

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

drop policy if exists "devices_select_admin" on public.devices;
create policy "devices_select_admin"
  on public.devices for select
  to authenticated
  using (public.is_admin());

drop policy if exists "device_replacements_select_admin" on public.device_replacements;
create policy "device_replacements_select_admin"
  on public.device_replacements for select
  to authenticated
  using (public.is_admin());

drop policy if exists "email_entitlements_select_admin" on public.email_entitlements;
create policy "email_entitlements_select_admin"
  on public.email_entitlements for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admin_audit_log_select_admin" on public.admin_audit_log;
create policy "admin_audit_log_select_admin"
  on public.admin_audit_log for select
  to authenticated
  using (public.is_admin());

-- ============================================================
-- 4. Internal helpers
-- ============================================================

create or replace function public._admin_require()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not-authenticated' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create or replace function public._admin_log(
  p_action text,
  p_target_user_id uuid,
  p_target_email text,
  p_before jsonb,
  p_after jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text;
begin
  select email into v_actor_email from public.profiles where id = v_actor;
  insert into public.admin_audit_log (
    actor_id, actor_email, target_user_id, target_email,
    action, before, after
  )
  values (
    v_actor, v_actor_email, p_target_user_id, p_target_email,
    p_action, p_before, p_after
  );
end;
$$;

-- ============================================================
-- 5. Admin RPCs
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
      'entitlement_note', (
        select note from public.email_entitlements e
        where lower(e.email) = lower(p.email)
      )
    ) as row
    from public.profiles p
    where (p_status is null or p.status = p_status)
  ) sub;

  return jsonb_build_object('ok', true, 'users', v_rows);
end;
$$;

create or replace function public.admin_approve_user(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_target_user_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  perform public._admin_require();

  if v_email = '' then
    raise exception 'invalid-email' using errcode = '22023';
  end if;

  select id into v_target_user_id
  from public.profiles
  where lower(email) = v_email
  limit 1;

  select jsonb_build_object(
    'entitlement', (select to_jsonb(e) from public.email_entitlements e where lower(e.email) = v_email),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_target_user_id)
  ) into v_before;

  insert into public.email_entitlements (email, status, note)
  values (v_email, 'active', coalesce((v_before->'entitlement'->>'note'), '관리자 승인'))
  on conflict (email) do update
    set status = 'active',
        updated_at = now();

  if v_target_user_id is not null then
    update public.profiles
    set status = 'active', updated_at = now()
    where id = v_target_user_id;
  end if;

  select jsonb_build_object(
    'entitlement', (select to_jsonb(e) from public.email_entitlements e where lower(e.email) = v_email),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_target_user_id)
  ) into v_after;

  perform public._admin_log('approve', v_target_user_id, v_email, v_before, v_after);

  return jsonb_build_object('ok', true, 'email', v_email, 'user_id', v_target_user_id);
end;
$$;

create or replace function public.admin_set_user_status(
  p_user_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_before jsonb;
  v_after jsonb;
begin
  perform public._admin_require();

  if p_status not in ('active', 'blocked', 'expired', 'pending') then
    raise exception 'invalid-status: %', p_status using errcode = '22023';
  end if;

  select email into v_email from public.profiles where id = p_user_id;
  if v_email is null then
    raise exception 'user-not-found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_user_id),
    'entitlement', (select to_jsonb(e) from public.email_entitlements e where lower(e.email) = lower(v_email))
  ) into v_before;

  update public.profiles
  set status = p_status, updated_at = now()
  where id = p_user_id;

  -- Mirror to entitlement so re-login doesn't auto-reactivate via ensure_profile.
  if p_status in ('blocked', 'expired') then
    insert into public.email_entitlements (email, status, note)
    values (lower(v_email), p_status, '관리자 ' || p_status)
    on conflict (email) do update
      set status = p_status, updated_at = now();
  elsif p_status = 'active' then
    insert into public.email_entitlements (email, status, note)
    values (lower(v_email), 'active', '관리자 활성화')
    on conflict (email) do update
      set status = 'active', updated_at = now();
  end if;

  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_user_id),
    'entitlement', (select to_jsonb(e) from public.email_entitlements e where lower(e.email) = lower(v_email))
  ) into v_after;

  perform public._admin_log('set_status', p_user_id, v_email, v_before, v_after);

  return jsonb_build_object('ok', true, 'user_id', p_user_id, 'status', p_status);
end;
$$;

create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_current_role text;
  v_admin_count integer;
  v_before jsonb;
  v_after jsonb;
begin
  perform public._admin_require();

  if p_role not in ('user', 'admin') then
    raise exception 'invalid-role: %', p_role using errcode = '22023';
  end if;

  select email, role into v_email, v_current_role
  from public.profiles where id = p_user_id;

  if v_email is null then
    raise exception 'user-not-found' using errcode = 'P0002';
  end if;

  if v_current_role = 'admin' and p_role = 'user' then
    select count(*) into v_admin_count
    from public.profiles where role = 'admin';
    if v_admin_count <= 1 then
      raise exception 'last_admin_cannot_be_demoted' using errcode = 'P0001';
    end if;
  end if;

  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_user_id)
  ) into v_before;

  update public.profiles
  set role = p_role, updated_at = now()
  where id = p_user_id;

  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_user_id)
  ) into v_after;

  perform public._admin_log('set_role', p_user_id, v_email, v_before, v_after);

  return jsonb_build_object('ok', true, 'user_id', p_user_id, 'role', p_role);
end;
$$;

create or replace function public.admin_list_user_devices(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_devices jsonb;
  v_replacements jsonb;
begin
  perform public._admin_require();

  select coalesce(jsonb_agg(to_jsonb(d) order by d.registered_at desc), '[]'::jsonb)
  into v_devices
  from public.devices d
  where d.user_id = p_user_id;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.replaced_at desc), '[]'::jsonb)
  into v_replacements
  from public.device_replacements r
  where r.user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'devices', v_devices,
    'replacements', v_replacements,
    'next_replacement_at', public.next_replacement_at(p_user_id)
  );
end;
$$;

create or replace function public.admin_reset_user_devices(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_count integer;
begin
  perform public._admin_require();

  select email into v_email from public.profiles where id = p_user_id;
  if v_email is null then
    raise exception 'user-not-found' using errcode = 'P0002';
  end if;

  with reset as (
    update public.devices
    set replaced_at = now()
    where user_id = p_user_id and replaced_at is null
    returning 1
  )
  select count(*) into v_count from reset;

  perform public._admin_log(
    'reset_devices',
    p_user_id,
    v_email,
    null,
    jsonb_build_object('reset_count', v_count)
  );

  return jsonb_build_object('ok', true, 'user_id', p_user_id, 'reset_count', v_count);
end;
$$;

create or replace function public.admin_preauth_email(
  p_email text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_before jsonb;
  v_after jsonb;
begin
  perform public._admin_require();

  if v_email = '' then
    raise exception 'invalid-email' using errcode = '22023';
  end if;

  select to_jsonb(e) into v_before
  from public.email_entitlements e where lower(e.email) = v_email;

  insert into public.email_entitlements (email, status, note)
  values (v_email, 'active', coalesce(p_note, '사전 등록'))
  on conflict (email) do update
    set status = 'active',
        note = coalesce(excluded.note, public.email_entitlements.note),
        updated_at = now();

  select to_jsonb(e) into v_after
  from public.email_entitlements e where lower(e.email) = v_email;

  perform public._admin_log('preauth_email', null, v_email, v_before, v_after);

  return jsonb_build_object('ok', true, 'email', v_email);
end;
$$;

create or replace function public.admin_list_audit_log(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  perform public._admin_require();

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select * from public.admin_audit_log
    order by created_at desc
    limit greatest(1, least(coalesce(p_limit, 200), 1000))
  ) a;

  return jsonb_build_object('ok', true, 'entries', v_rows);
end;
$$;

create or replace function public.get_my_role()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'role', null);
  end if;
  select role into v_role from public.profiles where id = v_uid;
  return jsonb_build_object('ok', true, 'role', coalesce(v_role, 'user'));
end;
$$;

-- ============================================================
-- 6. EXECUTE permissions (defense in depth: revoke from anon, grant to authenticated only)
-- ============================================================

revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public._admin_require() from public, anon, authenticated;
revoke all on function public._admin_log(text, uuid, text, jsonb, jsonb) from public, anon, authenticated;

revoke all on function public.admin_list_users(text) from public, anon;
revoke all on function public.admin_approve_user(text) from public, anon;
revoke all on function public.admin_set_user_status(uuid, text) from public, anon;
revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
revoke all on function public.admin_list_user_devices(uuid) from public, anon;
revoke all on function public.admin_reset_user_devices(uuid) from public, anon;
revoke all on function public.admin_preauth_email(text, text) from public, anon;
revoke all on function public.admin_list_audit_log(integer) from public, anon;
revoke all on function public.get_my_role() from public, anon;

grant execute on function public.admin_list_users(text) to authenticated;
grant execute on function public.admin_approve_user(text) to authenticated;
grant execute on function public.admin_set_user_status(uuid, text) to authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.admin_list_user_devices(uuid) to authenticated;
grant execute on function public.admin_reset_user_devices(uuid) to authenticated;
grant execute on function public.admin_preauth_email(text, text) to authenticated;
grant execute on function public.admin_list_audit_log(integer) to authenticated;
grant execute on function public.get_my_role() to authenticated;

-- ============================================================
-- 7. Bootstrap (run ONCE manually after migration)
-- ============================================================
-- update public.profiles set role = 'admin'
--   where lower(email) = lower('cospick2019@gmail.com');
