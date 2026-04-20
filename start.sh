#!/bin/bash
# App_blog2 통합 실행 스크립트
# 사용법: ./start.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# 색상
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}==> App_blog2 시작${NC}"

# 포트 8000 이미 사용 중인지 체크
if lsof -i :8000 >/dev/null 2>&1; then
  echo -e "${YELLOW}[!] 포트 8000 이 이미 사용 중입니다. 기존 프로세스를 사용합니다.${NC}"
  BACKEND_PID=""
else
  echo -e "${GREEN}[1/2] 백엔드(FastAPI) 시작...${NC}"
  cd "$BACKEND_DIR"
  python3 main.py > /tmp/app_blog2_backend.log 2>&1 &
  BACKEND_PID=$!
  echo -e "    PID: $BACKEND_PID  (로그: /tmp/app_blog2_backend.log)"

  # 백엔드가 뜰 때까지 대기 (최대 15초)
  for i in {1..30}; do
    if lsof -i :8000 >/dev/null 2>&1; then
      echo -e "${GREEN}    ✓ 백엔드 준비 완료 (http://localhost:8000)${NC}"
      break
    fi
    sleep 0.5
    if [ $i -eq 30 ]; then
      echo -e "${RED}    ✗ 백엔드 시작 실패. 로그를 확인하세요: cat /tmp/app_blog2_backend.log${NC}"
      exit 1
    fi
  done
fi

# 종료 시 백엔드도 같이 종료
cleanup() {
  echo -e "\n${BLUE}==> 종료 중...${NC}"
  if [ -n "$BACKEND_PID" ]; then
    kill $BACKEND_PID 2>/dev/null || true
    echo -e "    백엔드 종료됨"
  fi
  exit 0
}
trap cleanup INT TERM

echo -e "${GREEN}[2/2] 프론트엔드(Next.js) 시작...${NC}"
echo -e "${YELLOW}    Ctrl+C 로 둘 다 종료됩니다.${NC}\n"
cd "$FRONTEND_DIR"
npm run dev

cleanup
