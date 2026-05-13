"""런타임 경로 단일 출처.

Electron 모드: main.ts가 APP_DATA_DIR (=`app.getPath('userData')`)을 env로 주입.
직접 실행 모드: APP_DATA_DIR 미지정 시 `~/.app_blog2` 기본값 사용.

이 모듈은 import 시점에 디렉터리들을 자동 생성하고, 설치 폴더에 있는
backend/default-data/*.json을 사용자 데이터 폴더로 1회 마이그레이션한다.
"""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path


def _resolve_app_data_dir() -> Path:
    env = os.environ.get("APP_DATA_DIR")
    if env:
        return Path(env)
    return Path.home() / ".app_blog2"


APP_DATA_DIR: Path = _resolve_app_data_dir()
DATA_DIR: Path = APP_DATA_DIR / "data"
LOG_DIR: Path = APP_DATA_DIR / "logs"
IMAGE_DIR: Path = APP_DATA_DIR / "images"
TMP_DIR: Path = APP_DATA_DIR / "tmp"

# Chrome 프로필 — 환경변수로 명시 주입되면 그걸 우선
CHROME_PROFILES_DIR: Path = Path(
    os.environ.get("CHROME_PROFILES_DIR")
    or os.environ.get("CHROME_PROFILE_DIR")
    or (APP_DATA_DIR / "chrome-profiles")
)


def _default_data_source_dir() -> Path | None:
    """설치본에서 default JSON이 들어있는 폴더 위치.

    PyInstaller _MEIPASS 또는 실행 파일 옆 backend/default-data 를 찾는다.
    개발 모드에선 backend/default-data 가 곧 이 디렉터리.
    """
    candidates: list[Path] = []
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(Path(meipass) / "default-data")
    candidates.append(Path(__file__).parent / "default-data")
    candidates.append(Path(sys.executable).parent / "default-data")
    for c in candidates:
        if c.exists():
            return c
    return None


def _ensure_dirs() -> None:
    for d in (APP_DATA_DIR, DATA_DIR, LOG_DIR, IMAGE_DIR, TMP_DIR, CHROME_PROFILES_DIR):
        d.mkdir(parents=True, exist_ok=True)


def _migrate_default_data() -> None:
    """data/ 폴더가 비어있고 default-data가 있으면 1회 복사."""
    src = _default_data_source_dir()
    if not src:
        return
    for json_file in src.glob("*.json"):
        target = DATA_DIR / json_file.name
        if not target.exists():
            try:
                shutil.copy2(json_file, target)
            except Exception:
                pass


_ensure_dirs()
_migrate_default_data()


# routers/config 가 import할 경로
ACCOUNTS_FILE: Path = DATA_DIR / "accounts.json"
ANALYSIS_RECORDS_FILE: Path = DATA_DIR / "analysis_records.json"
AEO_PROFILES_FILE: Path = DATA_DIR / "aeo_profiles.json"
BRAND_PROFILES_FILE: Path = DATA_DIR / "brand_profiles.json"
PRODUCTS_FILE: Path = DATA_DIR / "products.json"
