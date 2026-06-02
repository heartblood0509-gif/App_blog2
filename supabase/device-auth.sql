create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'blocked', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 동시 사용 차단용: 현재 "활성 기기" 1대를 기억한다.
-- 새 기기가 접속(claim)하면 갱신되고, 기존 기기는 다음 신호 때 superseded 로 끊긴다.
alter table public.profiles
  add column if not exists active_device_id text;

create table if not exists public.email_entitlements (
  email text primary key,
  status text not null default 'active'
    check (status in ('active', 'blocked', 'expired', 'pending')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 기존 DB(옛 3-값 제약)도 'pending' 을 허용하도록 제약을 갱신한다.
-- pending 은 "권한 없음(미승인)" 을 entitlement 로 표현하기 위함 —
-- 이름/메모만 저장하는 작업이 실수로 active 권한을 부여하지 못하게 한다.
alter table public.email_entitlements
  drop constraint if exists email_entitlements_status_check;
alter table public.email_entitlements
  add constraint email_entitlements_status_check
  check (status in ('active', 'blocked', 'expired', 'pending'));

-- 사용자 이름(display_name)과 자유 메모(memo)는 전용 컬럼으로 분리한다.
-- (기존 note 는 '사전 등록'/'관리자 승인' 등 시스템 문자열이 섞여 들어가므로 이름으로 쓰지 않는다.)
alter table public.email_entitlements
  add column if not exists display_name text;
alter table public.email_entitlements
  add column if not exists memo text;

-- 1회성 best-effort 마이그레이션: note 가 사람 이름으로 보이는 경우에만 display_name 으로 옮긴다.
-- 시스템이 자동 기록한 문자열은 제외. 재실행해도 이미 채워진 행은 건드리지 않는다.
update public.email_entitlements
set display_name = note
where display_name is null
  and note is not null
  and btrim(note) <> ''
  and note not in (
    '사전 등록', '관리자 승인', '관리자 활성화',
    '관리자 blocked', '관리자 expired', '관리자 active', '관리자 pending'
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

-- 인자(p_claim)를 추가하므로 시그니처가 바뀐다. create or replace 는 교체가 아니라
-- 오버로드를 만들어 옛 4-인자 함수가 남으므로, 반드시 먼저 drop 한다.
drop function if exists public.authorize_device(text, text, text, text);

-- p_claim 기본값은 null: 구버전 앱은 4-인자로 호출하므로 p_claim 이 null 이 된다.
-- null = "동시접속 제어 미참여"(마이그레이션 호환). 명시적 true/false 만 점유/확인에 참여한다.
create or replace function public.authorize_device(
  p_device_id text,
  p_device_name text,
  p_platform text,
  p_app_version text,
  p_claim boolean default null
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
  v_active_device text;
  v_registered boolean := false;
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

  -- 1) 이미 등록된 활성 기기면 메타데이터만 갱신.
  update public.devices
  set last_seen_at = now(),
      device_name = p_device_name,
      platform = p_platform,
      app_version = p_app_version
  where user_id = v_user_id
    and device_id = p_device_id
    and replaced_at is null;
  if found then
    v_registered := true;
  end if;

  -- 2) 미등록이면 빈 슬롯이 있을 때만 새로 등록(최대 2대).
  if not v_registered then
    select count(*) into v_active_count
    from public.devices
    where user_id = v_user_id
      and replaced_at is null;

    if v_active_count < 2 then
      insert into public.devices (
        user_id, device_id, device_name, platform, app_version, last_seen_at
      )
      values (
        v_user_id, p_device_id, p_device_name, p_platform, p_app_version, now()
      )
      on conflict (user_id, device_id) do update
        set device_name = excluded.device_name,
            platform = excluded.platform,
            app_version = excluded.app_version,
            last_seen_at = now(),
            replaced_at = null;
      v_registered := true;
    end if;
  end if;

  -- 3) 등록도 안 되고 슬롯도 꽉 찼으면 기기 한도 초과.
  if not v_registered then
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
  end if;

  -- 4) 동시 사용 차단(나중에 켠 기기 우선).
  --    p_claim = true  : 앱 새로 켜기/로그인/재시도 → 이 기기를 활성 기기로 점유.
  --    p_claim = false : 5분 배경 신호 → 내가 아직 활성 기기인지 확인만, 아니면 superseded.
  --    p_claim = null  : 구버전 앱(4-인자 호출) → 점유·차단 모두 하지 않고 통과(마이그레이션 호환).
  if p_claim is true then
    update public.profiles
    set active_device_id = p_device_id
    where id = v_user_id;
  elsif p_claim is false then
    select active_device_id into v_active_device
    from public.profiles where id = v_user_id;

    if v_active_device is null then
      -- 아직 점유한 기기가 없으면(예: 배포 직후) 나로 채운다.
      update public.profiles
      set active_device_id = p_device_id
      where id = v_user_id;
    elsif v_active_device <> p_device_id then
      return jsonb_build_object(
        'ok', false,
        'status', 'superseded',
        'profile_status', v_profile.status,
        'user_email', v_profile.email,
        'current_device_id', p_device_id,
        'devices', public.active_devices_json(v_user_id),
        'next_replacement_at', public.next_replacement_at(v_user_id),
        'message', '다른 기기에서 접속하여 이 기기는 로그아웃되었습니다.'
      );
    end if;
  end if;
  -- p_claim is null → 활성 기기 정보를 건드리지 않고 그대로 authorized 로 진행.

  return jsonb_build_object(
    'ok', true,
    'status', 'authorized',
    'profile_status', v_profile.status,
    'user_email', v_profile.email,
    'current_device_id', p_device_id,
    'devices', public.active_devices_json(v_user_id),
    'next_replacement_at', public.next_replacement_at(v_user_id)
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
    -- 교체로 들어온 기기를 활성 기기로 점유(다음 배경 신호에서 superseded 되지 않도록).
    update public.profiles set active_device_id = p_new_device_id where id = v_user_id;
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

  -- 교체로 들어온 기기를 활성 기기로 점유.
  update public.profiles set active_device_id = p_new_device_id where id = v_user_id;

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
revoke all on function public.authorize_device(text, text, text, text, boolean) from public, anon;
revoke all on function public.list_devices() from public, anon;
revoke all on function public.replace_device(text, text, text, text, text) from public, anon;

grant execute on function public.authorize_device(text, text, text, text, boolean) to authenticated;
grant execute on function public.list_devices() to authenticated;
grant execute on function public.replace_device(text, text, text, text, text) to authenticated;

-- Launch-day manual activation example:
-- update public.profiles set status = 'active', updated_at = now() where email = 'buyer@example.com';
