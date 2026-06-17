#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# App_blog2  클론 후 한 방 셋업 스크립트 (macOS)
#
#   git clone 직후 또는 새 머신에서:   ./setup.sh
#
# 하는 일 (모두 idempotent — 여러 번 돌려도 안전):
#   1. 루트 JS 의존성        (npm ci)
#   2. 프론트엔드 JS 의존성  (npm --prefix frontend ci)
#   3. 백엔드 Python 의존성  (pip install -r backend/requirements.txt, 전역 python3)
#   4. 발행용 Playwright 브라우저(chromium → playwright-cache)
#   5. 유튜브 백엔드 venv + 의존성 (python3.10+ 전용 .venv)
#   6. .env 안내
#
# ※ 의존성이 "추가"돼도 이 스크립트는 안 고쳐도 된다 — 목록(package-lock.json /
#   requirements.txt)을 그대로 읽기 때문. 폴더 구조나 외부 단계가 바뀔 때만 수정.
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
step() { echo -e "\n${BLUE}==> $1${NC}"; }
ok()   { echo -e "${GREEN}    ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}    ! $1${NC}"; }

# lockfile 이 있으면 npm ci(정확 재현), 없으면 npm install 폴백.
npm_install() { # $1 = 디렉터리(. 또는 frontend)
  local dir="$1"
  if [ -f "$dir/package-lock.json" ]; then
    ( cd "$dir" && npm ci )
  else
    warn "$dir/package-lock.json 없음 → npm install 로 대체"
    ( cd "$dir" && npm install )
  fi
}

# ── 1. 루트 JS 의존성 ──────────────────────────────────────────────
step "[1/5] 루트 JS 의존성 설치 (electron-builder 등)"
npm_install "."
ok "루트 node_modules 준비"

# ── 2. 프론트엔드 JS 의존성 ────────────────────────────────────────
step "[2/5] 프론트엔드 JS 의존성 설치 (Next.js)"
npm_install "frontend"
ok "frontend/node_modules 준비"

# ── 3. 백엔드 Python 의존성 (전역 python3 — start.sh 가 그렇게 실행) ──
step "[3/5] 백엔드 Python 의존성 설치 (backend/requirements.txt)"
if ! command -v python3 >/dev/null 2>&1; then
  echo -e "${RED}    ✗ python3 가 없습니다. https://www.python.org 에서 설치 후 다시 실행.${NC}"; exit 1
fi
python3 -m pip install -r backend/requirements.txt
ok "백엔드 의존성 설치 완료 ($(python3 --version 2>&1))"

# ── 4. 발행용 Playwright 브라우저 (backend python playwright) ────────
step "[4/5] Playwright 크로미움 설치 (발행 기능용 → playwright-cache)"
PLAYWRIGHT_BROWSERS_PATH="$ROOT/playwright-cache" python3 -m playwright install chromium
ok "playwright-cache 에 chromium 준비"

# ── 5. 유튜브 백엔드 venv + 의존성 (python3.10+) ───────────────────
step "[5/5] 유튜브 백엔드 venv + 의존성 (.venv, python3.10+)"
YT_DIR="$ROOT/youtube-backend"
if [ ! -f "$YT_DIR/requirements.txt" ]; then
  warn "youtube-backend/requirements.txt 없음 → 건너뜀"
else
  # fastapi>=0.135 등 때문에 3.10 이상 필요. 가능한 인터프리터 탐색.
  YT_PY=""
  for c in python3.13 python3.12 python3.11 python3.10; do
    if command -v "$c" >/dev/null 2>&1; then YT_PY="$c"; break; fi
  done
  if [ -z "$YT_PY" ]; then
    warn "python3.10+ 가 없어 youtube-backend venv 생략. (쇼츠 기능 쓰려면 설치 필요)"
  else
    if [ ! -x "$YT_DIR/.venv/bin/python" ]; then
      "$YT_PY" -m venv "$YT_DIR/.venv"
      ok "youtube-backend/.venv 생성 ($YT_PY)"
    else
      ok "youtube-backend/.venv 이미 존재 → 재사용"
    fi
    "$YT_DIR/.venv/bin/python" -m pip install -r "$YT_DIR/requirements.txt"
    ok "유튜브 백엔드 의존성 설치 완료"
  fi
fi

# ── 6. .env 안내 ───────────────────────────────────────────────────
step "마무리: 환경변수(.env)"
if [ ! -f "$ROOT/frontend/.env" ]; then
  warn "frontend/.env 가 없습니다 (선택)."
  echo    "      AI 키는 앱 설정 화면에서 입력해도 됩니다(가장 쉬움)."
  echo    "      .env 로 관리하려면:  cp frontend/.env.example frontend/.env  후 키 입력."
else
  ok "frontend/.env 존재"
fi

echo -e "\n${GREEN}✅ 셋업 완료!${NC}"
echo -e "   실행:  ${BLUE}npm run dev${NC} (Electron 전체)  또는  ${BLUE}./start.sh${NC} (웹만)"
