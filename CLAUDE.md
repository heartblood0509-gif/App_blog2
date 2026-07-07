# App Blog Publisher

반복 실수 방지용 메모. 그 외 정보는 코드/README/`scripts/dev-worktree.js` 참조.

## 워크트리 dev

- ⚠️ **워크트리 세션에서 파일 수정(Edit/Write)은 반드시 현재 워크트리(`.claude/worktrees/<이름>/`) 경로로.** 서브에이전트·검색이 메인 절대경로(`/Users/gwack/projects/App_blog2/frontend/...`)를 줘도 수정 직전 워크트리 경로로 번역할 것. (Read는 참고로 메인을 봐도 무방 — 막지 말 것. 단 그 경로 *그대로 수정*하면 dev엔 안 보이고 메인의 남 작업까지 오염됨)
- 워크트리에서 dev 테스트는 `npm run dev:worktree`(웹) 또는 `:electron` 한 줄로 끝. 의존성·포트·env·`playwright-cache` 다 자동 처리. **수동으로 `npm install`/symlink/env 짜지 말 것** — 스크립트 한계 발견 시 스크립트 자체를 고침.
- 메인 체크아웃에서는 `dev:worktree`가 거부됨. **Electron 테스트면 `npm run dev`** (Electron이 백엔드+Next를 직접 spawn), 웹만이면 `./start.sh`.

## 보안

- `ALLOW_INSECURE_DEV_AUTH=1`, `ALLOW_INSECURE_DEV_PW=1` 은 **dev 전용**. 프로덕션 코드/설정에 절대 금지.

## 개발 워크플로우

수정 후 Claude는 사용자가 따로 지시하지 않아도 아래 순서를 따른다.
"이번엔 생략"이라고 명시한 경우만 건너뛴다. 실패 시 즉시 보고하고 다음 단계로 넘어가지 않는다.

```sh
# 1. 코드 수정 (Edit / Write)

# 2. 타입체크 (빠름, 10~30초)
npm --prefix frontend run typecheck

# 3. 린트
npm --prefix frontend run lint

# 4. 테스트 (변경 영역에 테스트가 있을 때만)
npm --prefix frontend test

# 5. UI 컴포넌트 / CSS 수정 시 — 사용자에게 dev 서버 실행 여부 확인
#    실행 요청 시 워크트리: `npm run dev:worktree`, 메인 체크아웃: `./start.sh` 또는 `npm run dev`

# 6. 커밋 / PR 직전 게이트
#    기본: 린트만 (typecheck는 2번에서 끝남)
npm --prefix frontend run lint

#    아래 중 하나라도 해당하면 추가로 풀 빌드:
#      · 서버/클라이언트 경계 변경 ("use client" 추가/제거, API route, proxy)
#      · `next.config.ts`, `tsconfig.json`, 의존성(`package.json`) 변경
#      · 여러 폴더에 걸친 큰 수정
#      · 머지 직후 패키징/배포 예정
npm --prefix frontend run build          # 메인 체크아웃
#    ⚠️ 워크트리에서는 위 명령이 Turbopack 심링크 거부로 실패한다(node_modules 가 메인 심링크).
#    워크트리 풀 빌드는 아래 한 줄 — dev 와 동일하게 자동으로 --webpack 을 붙여준다.
npm run build:worktree                   # 워크트리 (scripts/dev-worktree.js --build)
```

- `next build`는 타입체크는 포함하지만 **ESLint는 돌리지 않는다**(Next.js 16에서 `next lint` 제거).
  그래서 lint는 `npm --prefix frontend run lint`(또는 `npx eslint src`)로 따로 점검해야 한다.
  2~3번은 "빠른 사전 점검", 6번 풀 빌드는 "출시 형태로 조립 가능한지 최종 확인". 매번 돌릴 필요는 없음.
- Electron(`electron/`) 코드를 건드린 경우엔 추가로 `npm run build:electron`.
- **새소식**: 커밋/PR 직전, 사용자가 체감할 변경이면 `frontend/public/whats-new.json`에 항목 추가(기존 형식 유지: `type`=new/improve/fix, 친절한 사용자용 설명체, 버전은 다음 릴리스 기준). 내부 리팩터·CI·문서 등 사용자 무관 변경은 생략.
- `/commit-push-pr` 명령은 자체적으로 검증을 돌리지 않으므로, 명령을 호출하기 *전* 단계에서 위 게이트를 통과시킨다.
- 릴리스: `npm version`은 frontend가 git 루트가 아니라 버전만 bump하고 커밋·태그를 안 만든다 → `git add frontend/package*.json` 후 직접 커밋 + `git tag -a vX.Y.Z`로 마무리.
- **배포 파일명은 버전 없이 고정**: 릴리스 자산은 `Blog-Pick-Windows.exe` / `Blog-Pick-Mac-AppleSilicon.dmg` / `Blog-Pick-Mac-Intel.dmg` (파일명에 `${version}` 금지). 그래야 `https://github.com/heartblood0509-gif/App_blog2/releases/latest/download/<파일명>` 영구 다운로드 링크(챗봇 고정 FAQ·노션 설치 가이드)가 버전이 올라가도 안 깨진다. 파일명을 바꾸려면 그 링크들도 함께 고칠 것. (설정: `package.json`의 win `artifactName`, `.github/workflows/release.yml`의 mac dmg 리네임)
