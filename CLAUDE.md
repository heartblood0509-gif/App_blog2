# Project: App Blog Publisher

네이버 블로그 자동 발행을 위한 Electron 데스크톱 앱. 사용자(비엔지니어)가 글을 작성하면 백엔드의 Playwright 봇이 실제 Chromium 을 띄워 사람처럼 키 입력으로 발행한다.

## 구조

- `frontend/` — Next.js 16 (App Router, Turbopack 기본). 사용자 UI.
- `backend/`  — FastAPI + Playwright. 핵심 봇은 `backend/bots/naver_blog_publisher.py`.
- `electron/` — 데스크톱 셸. 개발 시 백엔드/프론트엔드를 자식 프로세스로 띄움.
- `scripts/`  — 빌드/유틸 스크립트 (Node + PowerShell + Bash 혼재).

## 로컬 dev 환경

### 메인 체크아웃 (`/path/to/App_blog2`)

평소대로:
- 웹 브라우저 테스트: `./start.sh` (백엔드 :8000 + Next.js :3000)
- Electron 앱: `npm run dev` (백엔드/프론트/Electron 자동 orchestrate)

### 워크트리에서 테스트 — **`npm run dev:worktree` 한 줄**

Claude Code 가 코드 수정 시 자동 생성하는 `.claude/worktrees/<name>/` 안에서 작업할 때, 매번 손으로 의존성·포트·env 를 셋업하지 말 것. 다음 스크립트 사용:

```bash
# 워크트리 루트에서
npm run dev:worktree            # 웹 브라우저 테스트 (브라우저로 localhost:3000)
npm run dev:worktree:electron   # Electron 데스크톱 앱 테스트
```

스크립트 (`scripts/dev-worktree.js`) 가 자동으로:
1. 메인 체크아웃의 의존성 디렉토리(`node_modules`, `frontend/node_modules`, `playwright-cache`) 를 OS 별 최적 방식으로 빌려옴
   - macOS: APFS clone (`cp -cR`, 즉시, CoW)
   - Linux: hardlink (`cp -lR`, 즉시)
   - Windows: junction (`mklink /J`, 즉시) — Git Bash/PowerShell/cmd 어디서나
   - 실패시 전체 복사로 폴백
   - `playwright-cache` 는 Electron dev 모드가 `PLAYWRIGHT_BROWSERS_PATH` 를 워크트리 경로로 주입하므로 필수 — 없으면 발행 시 Chromium 못 찾고 실패
2. `frontend/.env.local` 자동 생성 (메인의 키 복사 + `BACKEND_URL` + dev 우회 플래그)
3. 빈 포트 자동 선정 (8001 부터). **8000 은 다른 사용자/프로젝트가 점유 중일 수 있으므로 자동 회피**
4. 백엔드 → 프론트 순으로 기동, 양쪽 LISTEN 확인 후 URL 출력
5. Ctrl+C 로 종료 시 자식 프로세스 정리

### Claude 에게 — 워크트리에서 "테스트 해줘" 라는 요청 받으면

1. cwd 가 `.claude/worktrees/...` 안인지 확인
2. `npm run dev:worktree` 를 `run_in_background=true` 로 실행
3. 출력에서 `✓ dev-worktree READY` 와 `Frontend : http://localhost:<port>` 줄을 기다림
4. 사용자에게 그 URL 알려주고 검증 결과 회신 대기
5. 종료 요청 시 `TaskStop` 또는 SIGINT 로 정리

특별한 사정(스크립트가 안 맞는 경우, deps 가 진짜로 다른 경우) 이 아니면 **수동으로 `npm install` / `python3 main.py` 같은 단계를 새로 짜지 말 것**. 스크립트 한계가 발견되면 스크립트 자체를 수정.

## 봇 동작 핵심 (`backend/bots/naver_blog_publisher.py`)

- 발행 시작 시 `https://nid.naver.com/nidlogin.login?mode=form&url=https://www.naver.com/` 로 진입 (`_navigate_to_editor`)
- 로그인 폼은 type=password 기준으로 자동 탐지 (`_auto_login`), ID/PW 는 **키스트로크 한 가지만** 사용 (Playwright fill 안 씀)
- 본문은 SmartEditor ONE iframe 안에서 키스트로크로 입력 (10~25ms 간격, 로그인은 40~90ms)
- UA/헤더는 호스트 OS 감지해 동적 생성 (`_realistic_browser_profile`)
- Stealth: `--disable-blink-features=AutomationControlled` + `navigator.webdriver` 위장

봇 수정 시 dev 검증은 위의 `npm run dev:worktree` 로.

## 보안/배포

- main 브랜치 푸시는 GitHub Actions 가 release 빌드. 직접 force push 금지.
- `.env.local` / 자격증명은 `git ignore` 됨. 커밋에 절대 포함 금지.
- `ALLOW_INSECURE_DEV_AUTH=1`, `ALLOW_INSECURE_DEV_PW=1` 은 **dev 전용**. 프로덕션 코드/설정에 절대 넣지 말 것.
