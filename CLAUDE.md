# App Blog Publisher

반복 실수 방지용 메모. 그 외 정보는 코드/README/`scripts/dev-worktree.js` 참조.

## 워크트리 dev

- 워크트리에서 dev 테스트는 `npm run dev:worktree`(웹) 또는 `:electron` 한 줄로 끝. 의존성·포트·env·`playwright-cache` 다 자동 처리. **수동으로 `npm install`/symlink/env 짜지 말 것** — 스크립트 한계 발견 시 스크립트 자체를 고침.

## 보안

- `ALLOW_INSECURE_DEV_AUTH=1`, `ALLOW_INSECURE_DEV_PW=1` 은 **dev 전용**. 프로덕션 코드/설정에 절대 금지.
