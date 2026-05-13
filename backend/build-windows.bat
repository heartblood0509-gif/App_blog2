@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM =====================================================
REM Backend (FastAPI + Playwright) PyInstaller 빌드
REM 사용법: 이 파일을 더블클릭하거나
REM        루트에서 `npm run build:backend` 로 호출
REM =====================================================

cd /d "%~dp0"

echo.
echo ========================================================
echo    Backend PyInstaller build
echo ========================================================
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo [error] Python not found on PATH.
    pause
    exit /b 1
)

echo [1/3] pip install dependencies...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo [error] pip install failed
    pause
    exit /b 1
)

python -m pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    python -m pip install pyinstaller
)

echo.
echo [2/3] Playwright chromium download (skipped if cached)...
if not defined PLAYWRIGHT_BROWSERS_PATH (
    set "PLAYWRIGHT_BROWSERS_PATH=%~dp0..\playwright-cache"
)
python -m playwright install chromium
if errorlevel 1 (
    echo [warn] playwright install failed, you can retry:
    echo        python -m playwright install chromium
)

echo.
echo [3/3] PyInstaller build (BlogPublisher.spec)...
python -m PyInstaller BlogPublisher.spec --clean --noconfirm
if errorlevel 1 (
    echo [error] PyInstaller build failed
    pause
    exit /b 1
)

echo.
echo ========================================================
echo    Build done: backend\dist\BlogPublisher\BlogPublisher.exe
echo ========================================================
endlocal
