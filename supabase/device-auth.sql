create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'blocked', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_entitlements (
  email text primary key,
  status text not null default 'active'
    check (status in ('active', 'blocked', 'expired')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  device_name text not null,
  platform text not null,
  app_version text,
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz,
  replaced_at timestamptz,
  unique (user_id, device_id)
);

create table if not exists public.device_replacements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  old_device_id text not null,
  new_device_id text not null,
  replaced_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.email_entitlements enable row level security;
alter table public.devices enable row level security;
alter table public.device_replacements enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- No direct client insert/update/delete policies are defined.
-- Device registration and replacement must go through the security-definer RPCs.

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, status)
  values (new.id, coalesce(new.email, ''), 'pending')
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

create or replace function public.active_devices_json(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'device_id', d.device_id,
        'device_name', d.device_name,
        'platform', d.platform,
        'app_version', d.app_version,
        'registered_at', d.registered_at,
        'last_seen_at', d.last_seen_at
      )
      order by d.registered_at asc
    ),
    '[]'::jsonb
  )
  from public.devices d
  where d.user_id = p_user_id
    and d.replaced_at is null;
$$;

create or replace function public.next_replacement_at(p_user_id uuid)
returns timestamptz
language sql
security definer
set search_path = public
as $$
  select max(replaced_at) + interval '30 days'
  from public.device_replacements
  where user_id = p_user_id;
$$;

create or replace function public.ensure_profile(p_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_email text;
  v_entitlement_status text;
begin
  select email into v_email from auth.users where id = p_user_id;
  select status into v_entitlement_status
  from public.email_entitlements
  where lower(email) = lower(coalesce(v_email, ''));

  insert into public.profiles (id, email, status)
  values (p_user_id, coalesce(v_email, ''), coalesce(v_entitlement_status, 'pending'))
  on conflict (id) do update
    set email = excluded.email,
        status = case
          when public.profiles.status = 'blocked' then public.profiles.status
          when v_entitlement_status is not null then v_entitlement_status
          else public.profiles.status
        end,
        updated_at = now();

  select * into v_profile from public.profiles where id = p_user_id;
  return v_profile;
end;
$$;

create or replace function public.authorize_device(
  p_device_id text,
  p_device_name text,
  p_platform text,
  p_app_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
  v_active_count integer;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'status', 'error', 'message', 'not-authenticated');
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  v_profile := public.ensure_profile(v_user_id);

  if v_profile.status <> 'active' then
    return jsonb_build_object(
      'ok', false,
      'status', v_profile.status,
      'profile_status', v_profile.status,
      'user_email', v_profile.email,
      'message',
        case v_profile.status
          when 'pending' then '구매 승인 대기 중입니다.'
          when 'blocked' then '계정 사용이 차단되었습니다.'
          when 'expired' then '사용 기간이 만료되었습니다.'
          else '계정 상태를 확인할 수 없습니다.'
        end
    );
  end if;

  update public.devices
  set last_seen_at = now(),
      device_name = p_device_name,
      platform = p_platform,
      app_version = p_app_version
  where user_id = v_user_id
    and device_id = p_device_id
    and replaced_at is null;

  if found then
    return jsonb_build_object(
      'ok', true,
      'status', 'authorized',
      'profile_status', v_profile.status,
      'user_email', v_profile.email,
      'current_device_id', p_device_id,
      'devices', public.active_devices_json(v_user_id),
      'next_replacement_at', public.next_replacement_at(v_user_id)
    );
  end if;

  select count(*) into v_active_count
  from public.devices
  where user_id = v_user_id
    and replaced_at is null;

  if v_active_count < 2 then
    insert into public.devices (
      user_id,
      device_id,
      device_name,
      platform,
      app_version,
      last_seen_at
    )
    values (
      v_user_id,
      p_device_id,
      p_device_name,
      p_platform,
      p_app_version,
      now()
    )
    on conflict (user_id, device_id) do update
      set device_name = excluded.device_name,
          platform = excluded.platform,
          app_version = excluded.app_version,
          last_seen_at = now(),
          replaced_at = null;

    return jsonb_build_object(
      'ok', true,
      'status', 'authorized',
      'profile_status', v_profile.status,
      'user_email', v_profile.email,
      'current_device_id', p_device_id,
      'devices', public.active_devices_json(v_user_id),
      'next_replacement_at', public.next_replacement_at(v_user_id)
    );
  end if;

  return jsonb_build_object(
    'ok', false,
    'status', 'device_limit',
    'profile_status', v_profile.status,
    'user_email', v_profile.email,
    'current_device_id', p_device_id,
    'devices', public.active_devices_json(v_user_id),
    'next_replacement_at', public.next_replacement_at(v_user_id),
    'message', '등록 가능한 기기 2대를 모두 사용 중입니다.'
  );
end;
$$;

create or replace function public.list_devices()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'status', 'error', 'message', 'not-authenticated');
  end if;

  v_profile := public.ensure_profile(v_user_id);
  return jsonb_build_object(
    'ok', v_profile.status = 'active',
    'status', case when v_profile.status = 'active' then 'authorized' else v_profile.status end,
    'profile_status', v_profile.status,
    'user_email', v_profile.email,
    'devices', public.active_devices_json(v_user_id),
    'next_replacement_at', public.next_replacement_at(v_user_id)
  );
end;
$$;

create or replace function public.replace_device(
  p_old_device_id text,
  p_new_device_id text,
  p_device_name text,
  p_platform text,
  p_app_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
  v_next_replacement timestamptz;
  v_active_count integer;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'status', 'error', 'message', 'not-authenticated');
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  v_profile := public.ensure_profile(v_user_id);

  if v_profile.status <> 'active' then
    return jsonb_build_object(
      'ok', false,
      'status', v_profile.status,
      'profile_status', v_profile.status,
      'user_email', v_profile.email
    );
  end if;

  update public.devices
  set last_seen_at = now(),
      device_name = p_device_name,
      platform = p_platform,
      app_version = p_app_version
  where user_id = v_user_id
    and device_id = p_new_device_id
    and replaced_at is null;

  if found then
    return jsonb_build_object(
      'ok', true,
      'status', 'authorized',
      'profile_status', v_profile.status,
      'user_email', v_profile.email,
      'current_device_id', p_new_device_id,
      'devices', public.active_devices_json(v_user_id),
      'next_replacement_at', public.next_replacement_at(v_user_id)
    );
  end if;

  select public.next_replacement_at(v_user_id) into v_next_replacement;
  if v_next_replacement is not null and v_next_replacement > now() then
    return jsonb_build_object(
      'ok', false,
      'status', 'device_limit',
      'profile_status', v_profile.status,
      'user_email', v_profile.email,
      'devices', public.active_devices_json(v_user_id),
      'next_replacement_at', v_next_replacement,
      'message', '기기 교체는 30일에 한 번만 가능합니다.'
    );
  end if;

  select count(*) into v_active_count
  from public.devices
  where user_id = v_user_id
    and replaced_at is null;

  if v_active_count >= 2 then
    update public.devices
    set replaced_at = now()
    where user_id = v_user_id
      and device_id = p_old_device_id
      and replaced_at is null;

    if not found then
      return jsonb_build_object(
        'ok', false,
        'status', 'device_limit',
        'profile_status', v_profile.status,
        'user_email', v_profile.email,
        'devices', public.active_devices_json(v_user_id),
        'next_replacement_at', public.next_replacement_at(v_user_id),
        'message', '교체할 기존 기기를 찾지 못했습니다.'
      );
    end if;

    insert into public.device_replacements (user_id, old_device_id, new_device_id)
    values (v_user_id, p_old_device_id, p_new_device_id);
  end if;

  insert into public.devices (
    user_id,
    device_id,
    device_name,
    platform,
    app_version,
    last_seen_at
  )
  values (
    v_user_id,
    p_new_device_id,
    p_device_name,
    p_platform,
    p_app_version,
    now()
  )
  on conflict (user_id, device_id) do update
    set device_name = excluded.device_name,
        platform = excluded.platform,
        app_version = excluded.app_version,
        last_seen_at = now(),
        replaced_at = null;

  return jsonb_build_object(
    'ok', true,
    'status', 'authorized',
    'profile_status', v_profile.status,
    'user_email', v_profile.email,
    'current_device_id', p_new_device_id,
    'devices', public.active_devices_json(v_user_id),
    'next_replacement_at', public.next_replacement_at(v_user_id)
  );
end;
$$;

revoke all on function public.active_devices_json(uuid) from public, anon, authenticated;
revoke all on function public.next_replacement_at(uuid) from public, anon, authenticated;
revoke all on function public.ensure_profile(uuid) from public, anon, authenticated;
revoke all on function public.handle_new_user_profile() from public, anon, authenticated;
revoke all on function public.authorize_device(text, text, text, text) from public, anon;
revoke all on function public.list_devices() from public, anon;
revoke all on function public.replace_device(text, text, text, text, text) from public, anon;

grant execute on function public.authorize_device(text, text, text, text) to authenticated;
grant execute on function public.list_devices() to authenticated;
grant execute on function public.replace_device(text, text, text, text, text) to authenticated;

-- Launch-day manual activation example:
-- update public.profiles set status = 'active', updated_at = now() where email = 'buyer@example.com';
