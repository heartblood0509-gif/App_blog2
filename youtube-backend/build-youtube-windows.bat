@echo off
setlocal
cd /d "%~dp0"

echo.
echo ========================================================
echo    YouTube backend (Shorts) PyInstaller build
echo ========================================================
echo.

REM youtube-backend 는 Python 3.10+ 필요. py launcher 로 적합 버전 탐색.
set "PY="
for %%V in (3.13 3.12 3.11 3.10) do (
  if not defined PY (
    py -%%V -c "import sys" >nul 2>&1 && set "PY=py -%%V"
  )
)
if not defined PY (
  python -c "import sys; sys.exit(0 if sys.version_info[:2]>=(3,10) else 1)" >nul 2>&1 && set "PY=python"
)
if not defined PY (
  echo [error] Python 3.10+ not found.
  exit /b 1
)
echo [youtube] using %PY%

echo [1/2] pip install dependencies...
%PY% -m pip install --upgrade pip
%PY% -m pip install -r requirements.txt
%PY% -m pip show pyinstaller >nul 2>&1 || %PY% -m pip install pyinstaller

echo.
echo [2/2] PyInstaller build (YoutubeGenerator.spec)...
%PY% -m PyInstaller YoutubeGenerator.spec --clean --noconfirm

echo.
echo ========================================================
echo    Build done: youtube-backend\dist\YoutubeGenerator\YoutubeGenerator.exe
echo ========================================================
endlocal
