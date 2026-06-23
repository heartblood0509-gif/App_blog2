-- 프로필 계정 귀속 백업/복원 (포맷·PC교체 대비)
-- 사용자당 1행에 프로필 번들(브랜드/AEO/제품/보관함) 전체를 JSONB로 보관.
-- 데스크톱 앱은 service-role 키를 싣지 못하므로, 브라우저 클라이언트가
-- 사용자 JWT로만 접근한다 → RLS로 본인 행만 읽기/쓰기 허용.
--
-- 적용: Supabase 대시보드 SQL Editor 에서 이 파일 전체를 한 번 실행.
-- (재실행 안전 — create ... if not exists / drop policy if exists 사용)

create table if not exists public.user_profile_sync (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  bundle      jsonb       not null,
  app_version text,
  updated_at  timestamptz not null default now()
);

alter table public.user_profile_sync enable row level security;

-- SQL Editor로 만든 테이블은 authenticated 역할에 테이블 권한이 자동으로 안 붙을 수 있다.
-- 브라우저가 PostgREST로 직접 접근(.from())하므로 GRANT 필요. (RLS가 행 단위는 따로 제한)
grant select, insert, update, delete on table public.user_profile_sync to authenticated;
grant select, insert, update, delete on table public.user_profile_sync to service_role;

drop policy if exists "ups_read"   on public.user_profile_sync;
drop policy if exists "ups_insert" on public.user_profile_sync;
drop policy if exists "ups_update" on public.user_profile_sync;

create policy "ups_read"
  on public.user_profile_sync
  for select
  using (auth.uid() = user_id);

create policy "ups_insert"
  on public.user_profile_sync
  for insert
  with check (auth.uid() = user_id);

create policy "ups_update"
  on public.user_profile_sync
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
