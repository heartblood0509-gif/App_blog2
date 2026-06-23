#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo
echo "========================================================"
echo "   YouTube backend (쇼츠 생성기) PyInstaller build"
echo "========================================================"
echo

# Python 선택은 칩(arch)별로 다르다.
#   · 인텔(x86_64): requirements 가 인텔에만 numpy==1.26.4 를 핀한다(구형 macOS<13.3 호환용).
#     1.26.4 는 cp313 휠이 없으므로 **반드시 Python 3.12** 로 빌드해야 한다. 3.13 으로 빌드하면
#     numpy 2.x 가 깔려 Accelerate 신형 심볼에 링크 → Monterey 등에서 import 즉시 크래시.
#   · 애플실리콘(arm64): 현행 동작 그대로 유지(불변).
ARCH="$(uname -m)"
PY=""
if [ "$ARCH" = "x86_64" ]; then
  for c in python3.12 python3; do
    if command -v "$c" >/dev/null 2>&1; then
      if "$c" -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3,12) else 1)'; then
        PY="$c"; break
      fi
    fi
  done
  if [ -z "$PY" ]; then
    echo "[error] Intel(x86_64) 빌드는 Python 3.12 필요 (numpy 1.26.4 는 cp313 휠 없음 / macOS<13.3 호환). brew install python@3.12" >&2
    exit 1
  fi
else
  # youtube-backend 는 Python >=3.10 필요 (fastapi>=0.135 등). 시스템 python3 가 낮을 수 있어 탐색.
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
fi
echo "[youtube] using $PY ($($PY --version 2>&1)) on $ARCH"

echo "[1/2] pip install dependencies (venv)..."
# PEP 668: CI 러너의 Homebrew python 은 externally-managed 라 시스템 pip install 이 거부된다.
# venv 안에 설치하면 어떤 python 이든(로컬·CI 공통) 안전하게 동작한다. (.venv/ 는 .gitignore 됨)
# 인텔은 이전 빌드의 3.13 venv 가 남아 혼선을 주지 않도록 --clear 로 깨끗이 재생성.
# (애플실리콘은 현행 그대로.)
if [ "$ARCH" = "x86_64" ]; then
  "$PY" -m venv --clear .venv
else
  "$PY" -m venv .venv
fi
VENV_PY=".venv/bin/python"
"$VENV_PY" -m pip install --upgrade pip
"$VENV_PY" -m pip install -r requirements.txt
"$VENV_PY" -m pip install pyinstaller
"$VENV_PY" -c "import numpy, sys; print('[youtube] arch=$ARCH python=' + sys.version.split()[0] + ' numpy=' + numpy.__version__)"

echo
echo "[2/2] PyInstaller build (YoutubeGenerator.spec)..."
"$VENV_PY" -m PyInstaller YoutubeGenerator.spec --clean --noconfirm

# 인텔(x86_64) 회귀 방지 가드 — 번들된 numpy 가 다시 2.x/Accelerate 로 돌아가면 여기서 빌드 실패.
# (애플실리콘엔 적용 안 함. bash 3.2 호환 위해 mapfile 미사용 — process substitution + while-read.)
if [ "$ARCH" = "x86_64" ]; then
  echo "[youtube] Intel 회귀 가드: numpy 1.26.x(OpenBLAS) + Accelerate 미링크 확인..."
  # 1차(결정적): 설치된 numpy 가 OpenBLAS 계열 1.26.x 인지 단언.
  "$VENV_PY" -c "import numpy; assert numpy.__version__.startswith('1.26'), 'unexpected numpy ' + numpy.__version__"
  # 2차(보강): 번들된 numpy .so 전부가 system Accelerate 에 링크되지 않았는지 검사(linalg 등 포함).
  found_numpy_so=0
  while IFS= read -r so; do
    found_numpy_so=1
    if otool -L "$so" | grep -qi Accelerate; then
      echo "[error] Intel build: '$so' 가 Accelerate.framework 에 링크됨 → macOS<13.3 에서 크래시. OpenBLAS(numpy 1.26.x) 기대." >&2
      exit 1
    fi
  done < <(find dist/YoutubeGenerator -path '*/numpy/*' -name '*.so')
  if [ "$found_numpy_so" -eq 0 ]; then
    echo "[error] Intel build: 번들에서 numpy .so 를 찾지 못함 (예상 경로 dist/YoutubeGenerator/.../numpy/*.so)." >&2
    exit 1
  fi
  echo "[youtube] 가드 통과: numpy 1.26.x, Accelerate 미링크."
fi

echo
echo "========================================================"
echo "   Build done: youtube-backend/dist/YoutubeGenerator/YoutubeGenerator"
echo "========================================================"
