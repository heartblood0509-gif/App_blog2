#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo
echo "========================================================"
echo "   Backend PyInstaller build"
echo "========================================================"
echo

if ! command -v python3 >/dev/null 2>&1; then
  echo "[error] python3 not found on PATH." >&2
  exit 1
fi

echo "[1/3] pip install dependencies..."
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt

if ! python3 -m pip show pyinstaller >/dev/null 2>&1; then
  python3 -m pip install pyinstaller
fi

echo
echo "[2/3] Playwright chromium download (skipped if cached)..."
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$(pwd)/../playwright-cache}"
# --no-shell: 앱은 headed(headless=False)로만 실행 → headless 셸(약 184MB) 불필요. (set -e 로 실패 시 자동 중단)
python3 -m playwright install chromium --no-shell

echo
echo "[3/3] PyInstaller build (BlogPublisher.spec)..."
python3 -m PyInstaller BlogPublisher.spec --clean --noconfirm

echo
echo "========================================================"
echo "   Build done: backend/dist/BlogPublisher/BlogPublisher"
echo "========================================================"
