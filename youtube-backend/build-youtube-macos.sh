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

echo "[1/2] pip install dependencies (venv)..."
# PEP 668: CI 러너의 Homebrew python 은 externally-managed 라 시스템 pip install 이 거부된다.
# venv 안에 설치하면 어떤 python 이든(로컬·CI 공통) 안전하게 동작한다. (.venv/ 는 .gitignore 됨)
"$PY" -m venv .venv
VENV_PY=".venv/bin/python"
"$VENV_PY" -m pip install --upgrade pip
"$VENV_PY" -m pip install -r requirements.txt
"$VENV_PY" -m pip install pyinstaller

echo
echo "[2/2] PyInstaller build (YoutubeGenerator.spec)..."
"$VENV_PY" -m PyInstaller YoutubeGenerator.spec --clean --noconfirm

echo
echo "========================================================"
echo "   Build done: youtube-backend/dist/YoutubeGenerator/YoutubeGenerator"
echo "========================================================"
