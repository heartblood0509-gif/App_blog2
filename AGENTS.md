# App Blog Publisher 에이전트 지시사항

## 프로젝트 구조

- Next.js 프론트엔드는 `frontend/` 아래에 있다.
- 프론트엔드 명령은 항상 `npm --prefix frontend ...` 형식으로 실행한다.
- 루트 패키지는 Electron, 패키징, 워크트리 개발 스크립트를 담당한다.
- 이 프로젝트에서는 `bun`이나 `pnpm`이 아니라 `npm`을 사용한다.
- 워크트리 개발 환경은 루트의 `scripts/dev-worktree.js`가 관리한다. 의존성 설치, 포트, env, `playwright-cache`를 수동으로 맞추지 말고 기존 스크립트를 사용한다.
- `frontend/` 파일을 수정할 때는 `frontend/AGENTS.md`의 Next.js 주의사항도 따른다.

## 개발 워크플로우

코드를 수정한 뒤에는 사용자가 명시적으로 "이번엔 생략" 또는 "검증하지 마"라고 말하지 않는 한, 마무리 전에 변경 범위에 맞는 검증을 실행한다.

검증이 실패하면 가능한 범위에서 원인을 고치고 같은 검증을 다시 실행한다. 실행하지 못한 검증이나 계속 실패하는 검증이 있으면 마지막 응답에 이유와 함께 보고한다.

**새소식**: 커밋/PR 직전, 사용자가 체감할 변경이면 `frontend/public/whats-new.json`에 항목을 추가한다(기존 형식 유지: `type`=new/improve/fix, 친절한 사용자용 설명체, 버전은 다음 릴리스 기준). 내부 리팩터·CI·문서 등 사용자와 무관한 변경은 생략한다.

프론트엔드 TypeScript, React, CSS, Next.js 파일을 수정한 경우:

1. 빠른 타입체크를 실행한다.
   `npm --prefix frontend run typecheck`

2. 린트를 실행한다.
   `npm --prefix frontend run lint`

3. 동작, 유틸, 훅, 상태 관리, 파싱, 테스트가 있는 영역을 바꾼 경우 테스트를 실행한다.
   `npm --prefix frontend test`

4. 변경 범위가 넓거나 커밋/PR 직전이면 마지막 게이트를 실행한다.
   `npm --prefix frontend run lint && npm --prefix frontend run build`

Electron 코드를 수정한 경우:

- `npm run build:electron`을 실행한다.
- 패키징, 업데이트, 런타임 동작을 바꾼 경우 관련 루트 검증 스크립트나 스모크 테스트 실행을 검토하고, 실행하지 못했다면 이유를 보고한다.

UI, CSS, 레이아웃, 공용 컴포넌트를 수정한 경우:

- 가능하면 앱을 띄워서 화면을 직접 확인한다.
- 워크트리에서는 웹 확인에 `npm run dev:worktree`를 우선 사용한다.
- 메인 체크아웃에서 웹만 확인할 때는 `./start.sh`를 사용한다.
- Electron 확인이 필요하면 메인 체크아웃에서는 `npm run dev`, 워크트리에서는 `npm run dev:worktree:electron`을 사용한다.
- 실행한 검증과 생략한 검증이 있으면 마지막 응답에 함께 적는다.
