# Supabase Device Auth Setup

이 폴더는 2026-05-22 1차 판매용 Google 로그인/기기 2대 제한 설정입니다.

## 1. Supabase

1. Supabase 프로젝트를 만든다.
2. Authentication > Providers > Google을 켠다.
3. Google Cloud OAuth callback에는 Supabase callback URL을 등록한다.
   - `https://<project-ref>.supabase.co/auth/v1/callback`
4. Supabase Authentication > URL Configuration > Redirect URLs에 앱 딥링크를 등록한다.
   - `com.heartblood.appblog2://auth/callback`
5. SQL Editor에서 `device-auth.sql` 전체를 실행한다.

## 2. App Env

현재 앱에는 아래 Supabase 공개 설정이 포함되어 있다. publishable key는 공개 키라 앱에 포함되어도 된다.

```bash
SUPABASE_URL=https://dhwysuflubrnmbapjrxs.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_FcFQMuFsq59V1zXi5Pjb8g_bJkYYh_P
SUPABASE_AUTH_REDIRECT_TO=com.heartblood.appblog2://auth/callback
```

다른 Supabase 프로젝트로 바꿔 테스트할 때는 빌드/실행 환경에 아래 값을 넣으면 코드에 포함된 기본값보다 우선한다.

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-or-publishable-key>
SUPABASE_AUTH_REDIRECT_TO=com.heartblood.appblog2://auth/callback
```

개발 중 인증을 잠시 끄려면 아래 값을 쓸 수 있다. 출시 빌드에는 넣지 않는다.

```bash
APP_REQUIRE_USER_AUTH=0
```

## 3. Launch Operations

구매 확인 후 결제 이메일을 미리 active로 등록할 수 있다. 구매자는 같은 Google 이메일로 로그인해야 한다.

```sql
insert into public.email_entitlements (email, status, note)
values ('buyer@example.com', 'active', '2026-05-22 launch sale')
on conflict (email) do update
set status = excluded.status,
    note = excluded.note,
    updated_at = now();
```

이미 한 번 로그인해서 `profiles` row가 생긴 사용자는 직접 active로 바꿔도 된다.

```sql
update public.profiles
set status = 'active', updated_at = now()
where email = 'buyer@example.com';
```

고객지원용 상태 변경:

```sql
-- 차단
update public.profiles set status = 'blocked', updated_at = now() where email = 'buyer@example.com';

-- 만료
update public.profiles set status = 'expired', updated_at = now() where email = 'buyer@example.com';

-- 특정 기기 강제 해제
update public.devices
set replaced_at = now()
where user_id = (select id from public.profiles where email = 'buyer@example.com')
  and device_id = '<device-id>'
  and replaced_at is null;
```

## 4. Current Security Boundary

이 구현은 일반 사용자 계정 공유 방지용이다. Electron/Next/FastAPI가 사용자 PC에서 실행되므로 앱 바이너리 변조까지 강하게 막지는 않는다. 시장 반응 확인 후 AI 호출, 핵심 프롬프트, 발행 권한 검사를 중앙 서버로 이전해 보안을 강화한다.
