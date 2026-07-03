-- 항목단위 프로필 동기화 (여러 기기 실시간 양방향) — M2
--
-- 사용자당 "프로필 1개 = 1행". 생성/수정/삭제를 항목 단위로 전파하고,
-- 삭제는 하드 delete 가 아니라 deleted_at(tombstone)으로 표현해 다른 기기로 전파한다.
-- item_uuid 는 기기 공통 안정 식별자(로컬 id 인 brandN 과 별개).
-- source_device 는 "이 행을 마지막으로 쓴 기기" — 자기 write 가 realtime 으로
-- 되돌아온 것(echo)을 필터링하는 용도.
--
-- 적용: Supabase 대시보드 SQL Editor 에서 이 파일 전체를 한 번 실행(재실행 안전).
-- 데스크톱 앱은 사용자 JWT 로만 접근 → RLS 로 본인 행만 허용.

create table if not exists public.user_profiles (
  user_id       uuid        not null references auth.users(id) on delete cascade,
  kind          text        not null check (kind in ('brand','aeo','product','analysis','saved-color')),
  item_uuid     uuid        not null,
  payload       jsonb       not null default '{}'::jsonb,  -- 비밀값 제외 레코드 스냅샷(로컬 id 제거)
  deleted_at    timestamptz,                                -- tombstone (null = 활성)
  updated_at    timestamptz not null default now(),         -- 교차기기 LWW 기준(서버시계)
  source_device text,                                       -- 마지막으로 쓴 기기(echo 필터)
  primary key (user_id, kind, item_uuid)
);

-- 기존 설치본: kind CHECK 제약에 새 kind('saved-color')를 추가한다.
-- `create table if not exists` 는 이미 있는 테이블의 제약을 갱신하지 않으므로 별도 ALTER 필요.
-- 인라인 무명 제약은 Postgres 관례상 user_profiles_kind_check 로 명명된다(재실행 안전).
alter table public.user_profiles drop constraint if exists user_profiles_kind_check;
alter table public.user_profiles
  add constraint user_profiles_kind_check
  check (kind in ('brand','aeo','product','analysis','saved-color'));

create index if not exists user_profiles_user_updated_idx
  on public.user_profiles (user_id, updated_at desc);

alter table public.user_profiles enable row level security;

grant select, insert, update, delete on table public.user_profiles to authenticated;
grant select, insert, update, delete on table public.user_profiles to service_role;

drop policy if exists "up_read"   on public.user_profiles;
drop policy if exists "up_insert" on public.user_profiles;
drop policy if exists "up_update" on public.user_profiles;
drop policy if exists "up_delete" on public.user_profiles;

create policy "up_read"
  on public.user_profiles
  for select
  using (auth.uid() = user_id);

create policy "up_insert"
  on public.user_profiles
  for insert
  with check (auth.uid() = user_id);

create policy "up_update"
  on public.user_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "up_delete"
  on public.user_profiles
  for delete
  using (auth.uid() = user_id);

-- updated_at 을 항상 서버시계로 스탬프(INSERT/UPDATE 공통). default now() 는 INSERT 에만
-- 적용되므로, UPDATE(=upsert 충돌) 에도 갱신되도록 트리거로 강제한다(LWW·표시용).
create or replace function public.user_profiles_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists user_profiles_touch on public.user_profiles;
create trigger user_profiles_touch
  before insert or update on public.user_profiles
  for each row execute function public.user_profiles_touch_updated_at();

-- ─────────────────────────────────────────────
-- Realtime — 항목 단위 INSERT/UPDATE/DELETE 를 다른 기기가 실시간 수신.
-- ⚠️ publication 미적용 시 42P01 없이 '조용히' 이벤트가 안 온다 → 반드시 실행.
-- ─────────────────────────────────────────────

alter table public.user_profiles replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_profiles'
  ) then
    alter publication supabase_realtime add table public.user_profiles;
  end if;
end $$;
