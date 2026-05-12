# -*- mode: python ; coding: utf-8 -*-
"""
BlogPublisher PyInstaller 설정 (App_blog2)
- FastAPI + Uvicorn + Playwright 백엔드를 단일 폴더(onedir)로 번들링
- Playwright 브라우저는 별도 (electron-builder의 extraResources로 처리)
- 진입점: main.py → run()
"""

from PyInstaller.utils.hooks import collect_all, collect_submodules

# default-data를 _MEIPASS/default-data 로 포함 (paths.py의 _default_data_source_dir이 먼저 찾는 경로)
datas = [("default-data", "default-data")]
binaries = []
hiddenimports = []

for pkg in ("playwright", "fastapi", "uvicorn", "pydantic", "starlette", "dotenv"):
    pkg_datas, pkg_binaries, pkg_hidden = collect_all(pkg)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hidden

# Uvicorn 동적 import (PyInstaller가 자동 추적 못 함)
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

# 프로젝트 내부 모듈 — PyInstaller가 from-import를 못 찾을 때 대비
hiddenimports += [
    "paths",
    "config",
    "main",
    "routers",
    "routers.publish",
    "routers.accounts",
    "routers.brand_profiles",
    "routers.analysis_records",
    "routers.products",
    "core",
    "core.markdown_converter",
    "bots",
    "bots.naver_blog_publisher",
    "utils",
    "utils.image_storage",
]

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
    name="BlogPublisher",
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
    name="BlogPublisher",
)
