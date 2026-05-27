#!/usr/bin/env bash
# verify-orphans.sh
#
# macOS 회귀 검증 — 설치본을 부팅 → 자식 트리(BlogPublisher/Chromium) 가 떴는지 확인
# → ⌘+Q 동등 quit 트리거 → 잔존 프로세스가 모두 사라졌는지 검증.
# 좀비가 남으면 비-zero exit. (scripts/verify-orphans.ps1 의 macOS 짝)
#
# 실행 예:
#   bash scripts/verify-orphans.sh
#
# 가정:
#   - release/mac-arm64/Blog Pick.app  (또는 mac-universal) 가 존재 (npm run dist:mac 이후).
#
# 검증 대상: packaged 빌드만.
#   dev 모드(`npm run dev`)는 shell:true 경로의 한계로 회귀 검증 제외 — README 참조.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP=""
for candidate in \
  "$ROOT/release/mac-arm64/Blog Pick.app" \
  "$ROOT/release/mac/Blog Pick.app" \
  "$ROOT/release/mac-universal/Blog Pick.app"
do
  if [ -d "$candidate" ]; then
    APP="$candidate"
    break
  fi
done

if [ -z "$APP" ]; then
  echo "FAIL: 설치본을 찾을 수 없습니다 (release/mac-*/Blog Pick.app)" >&2
  echo "      먼저 'npm run dist:mac' 실행" >&2
  exit 2
fi

# paths.ts 의 app.setName("app-blog2-desktop") 로 인해 userData 는 productName 과 무관하게
# 항상 "app-blog2-desktop" 폴더 사용.
USER_DATA="$HOME/Library/Application Support/app-blog2-desktop"
CHROME_DIR="$USER_DATA/chrome-profiles"

# 우리 설치본에서 spawn 된 자식만 식별 (Path/인자 기반).
# - BlogPublisher: PyInstaller 백엔드 절대 경로.
# - Chromium 손자: --user-data-dir 인자에 chrome-profiles 포함.
our_children() {
  ps -axo pid=,command= \
    | grep -E "(${APP//\//\\/}|${CHROME_DIR//\//\\/})" \
    | grep -v "grep" \
    | awk '{print $1}' \
    | sort -u
}

echo "[verify-orphans] 부팅: $APP"
open -W "$APP" &
OPEN_PID=$!

echo "[verify-orphans] 12초 부팅 대기"
sleep 12

BEFORE=$(our_children | wc -l | tr -d ' ')
echo "[verify-orphans] before 자식: $BEFORE"
if [ "$BEFORE" -lt 2 ]; then
  echo "[verify-orphans] WARN: 자식 프로세스가 충분히 떠있지 않습니다 ($BEFORE). 부팅 실패 가능." >&2
fi

# ⌘+Q 등가 — osascript 로 정상 quit 트리거. 빨간 X 는 hide 만이라 의미 없음.
echo "[verify-orphans] osascript 로 quit 트리거"
osascript -e 'tell application "Blog Pick" to quit' >/dev/null 2>&1 || true

# 정상 teardown 시간 부여 — 8초 폴링.
for i in 1 2 3 4 5 6 7 8; do
  AFTER=$(our_children | wc -l | tr -d ' ')
  if [ "$AFTER" -eq 0 ]; then
    echo "[verify-orphans] PASS: 좀비 0개 (${i}초)"
    # open -W 가 종료되도록 (이미 quit 됐으면 곧 끝남).
    wait "$OPEN_PID" 2>/dev/null || true
    exit 0
  fi
  sleep 1
done

echo "[verify-orphans] FAIL: 좀비 ${AFTER}개"
ps -axo pid,ppid,pgid,stat,command \
  | grep -E "(${APP//\//\\/}|${CHROME_DIR//\//\\/})" \
  | grep -v "grep" >&2
exit 1
