# -*- mode: python ; coding: utf-8 -*-
"""
YoutubeGenerator PyInstaller 설정 (App_blog2 - 쇼츠 생성기)
- FastAPI + Uvicorn + SQLAlchemy + google-genai + soundfile/pydub + Pillow 백엔드를
  단일 폴더(onedir)로 번들링.
- ffmpeg / ffprobe 바이너리는 여기에 포함하지 않는다 → electron-builder extraResources 로
  별도 번들하고, Electron 이 FFMPEG_BIN / FFPROBE_BIN env 로 경로를 주입한다.
- static/ 와 fonts/ 는 런타임에 직접 읽으므로 datas 로 포함.
- 진입점: main.py (uvicorn.run)
"""

from PyInstaller.utils.hooks import (
    collect_all,
    collect_submodules,
    collect_dynamic_libs,
)

# 런타임에 파일시스템에서 직접 읽는 리소스.
# ⚠️ core/ 안의 비-파이썬 데이터 파일은 hiddenimports(submodules)로는 동봉되지 않으므로
#    여기 datas 에 명시해야 한다. (gemini_client.py 가 __file__ 기준으로 직접 read)
datas = [
    ("static", "static"),
    ("fonts", "fonts"),
    ("core/nb2_prompt_guide.txt", "core"),
    ("core/prompts", "core/prompts"),
]
binaries = []
hiddenimports = []

# 서드파티 패키지 — 데이터/바이너리/숨은 import 까지 통째로 수집.
# soundfile(libsndfile), Pillow, numpy, cryptography 등은 네이티브 라이브러리를 동반한다.
for pkg in (
    "fastapi",
    "uvicorn",
    "starlette",
    "pydantic",
    "pydantic_settings",
    "dotenv",
    "sqlalchemy",
    "soundfile",
    "numpy",
    "PIL",
    "pydub",
    "boto3",
    "botocore",
    "bcrypt",
    "jwt",            # PyJWT
    "cryptography",
    "multipart",      # python-multipart
    "httpx",
    "requests",
):
    pkg_datas, pkg_binaries, pkg_hidden = collect_all(pkg)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hidden

# google-genai (import 경로: google.genai)
g_datas, g_binaries, g_hidden = collect_all("google.genai")
datas += g_datas
binaries += g_binaries
hiddenimports += g_hidden

# soundfile 네이티브 libsndfile 확실히 동봉 (collect_all 이 놓치는 경우 대비).
binaries += collect_dynamic_libs("soundfile")

# Uvicorn 동적 import (PyInstaller 자동 추적 불가).
hiddenimports += collect_submodules("uvicorn")
hiddenimports += [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
]

# 프로젝트 내부 모듈 — from-import 를 PyInstaller 가 못 찾을 때 대비해 전부 수집.
for pkg in ("api", "core", "db", "jobs_queue"):
    hiddenimports += collect_submodules(pkg)
hiddenimports += ["config", "main"]

a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "notebook", "IPython"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="YoutubeGenerator",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="YoutubeGenerator",
)
