#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo
echo "========================================================"
echo "   YouTube backend (쇼츠 생성기) PyInstaller build"
echo "========================================================"
echo

# youtube-backend 는 Python >=3.10 필요 (fastapi>=0.135 등). 시스템 python3 가 낮을 수 있어 탐색.
PY=""
for c in python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$c" >/dev/null 2>&1; then
    if "$c" -c 'import sys; sys.exit(0 if sys.version_info[:2] >= (3,10) else 1)'; then
      PY="$c"; break
    fi
  fi
done
if [ -z "$PY" ]; then
  echo "[error] Python >=3.10 not found. brew install python@3.13" >&2
  exit 1
fi
echo "[youtube] using $PY ($($PY --version 2>&1))"

echo "[1/2] pip install dependencies..."
"$PY" -m pip install --upgrade pip
"$PY" -m pip install -r requirements.txt
if ! "$PY" -m pip show pyinstaller >/dev/null 2>&1; then
  "$PY" -m pip install pyinstaller
fi

echo
echo "[2/2] PyInstaller build (YoutubeGenerator.spec)..."
"$PY" -m PyInstaller YoutubeGenerator.spec --clean --noconfirm

echo
echo "========================================================"
echo "   Build done: youtube-backend/dist/YoutubeGenerator/YoutubeGenerator"
echo "========================================================"
