"""파일 기반 JSON 저장소 — 트랜잭션·원자적 쓰기·손상 자동복구 단일 계층.

프로필/분석 보관함 등 list[dict] 저장소가 "등록되면 절대 안 사라진다"를
만족하도록 한 곳에서 보장한다:

- atomic write + fsync (+ POSIX 디렉터리 fsync): 재부팅/정전에도 쓴 내용 보존.
- strict load (형태 검증): 손상을 조용한 [] 로 숨기지 않음.
- last-known-good 롤링 백업 + 자동복구: 손상 시 직전 유효본에서 되살림.
- 저장소별 락: 읽기-수정-쓰기 전체 직렬화(동시 등록 유실 방지).
- 손상본은 삭제 없이 .corrupt-<ts> 로 copy 보존(최후 수동복구).

쓰기 경로(create/update/delete/import/seed)는 transaction() 으로 RMW 전체를 감싸고,
읽기 경로(list/get)는 read() 를 쓴다. 복구 불가 손상이면 CorruptStoreError 를 올려
조용한 [] 대신 명시적 오류(상위에서 503)로 노출한다.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional

logger = logging.getLogger(__name__)

MAX_BACKUPS = 5  # 롤링 백업 보관 개수


class CorruptStoreError(Exception):
    """저장소 파일이 존재하나 유효한 list[dict] 로 읽을 수 없고, 백업 복구도 불가."""


# ─────────────────────────────────────────────
# 저장소별 락
# ─────────────────────────────────────────────
_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _lock_for(path: Path) -> threading.Lock:
    key = str(path)
    with _locks_guard:
        lk = _locks.get(key)
        if lk is None:
            lk = threading.Lock()
            _locks[key] = lk
        return lk


# ─────────────────────────────────────────────
# strict load (형태 검증)
# ─────────────────────────────────────────────
def _parse_strict(raw: str) -> list[dict]:
    """JSON 파싱 + top-level list / 각 item dict 검증. 위반 시 예외."""
    data = json.loads(raw)
    if not isinstance(data, list):
        raise ValueError("최상위가 list 가 아님")
    for item in data:
        if not isinstance(item, dict):
            raise ValueError("list 항목이 dict 가 아님")
    return data


def _read_file_strict(path: Path) -> list[dict]:
    return _parse_strict(path.read_text(encoding="utf-8"))


# ─────────────────────────────────────────────
# 백업 / 손상본 보존
# ─────────────────────────────────────────────
def _backup_paths(path: Path) -> list[Path]:
    """이 저장소의 백업들 — 파일명 타임스탬프 기준 최신 우선."""
    return sorted(path.parent.glob(f"{path.name}.bak-*"), reverse=True)


def _make_backup(path: Path) -> None:
    """현재(유효한) canonical 을 타임스탬프 백업으로 복사하고 오래된 건 정리."""
    if not path.exists():
        return
    ts = time.strftime("%Y%m%d-%H%M%S")
    dst = path.parent / f"{path.name}.bak-{ts}"
    n = 0
    while dst.exists():
        n += 1
        dst = path.parent / f"{path.name}.bak-{ts}-{n}"
    try:
        shutil.copy2(path, dst)
    except Exception:
        logger.warning("backup copy failed for %s", path.name, exc_info=True)
        return
    for old in _backup_paths(path)[MAX_BACKUPS:]:
        try:
            old.unlink()
        except Exception:
            pass


def _preserve_corrupt(path: Path) -> None:
    """손상본을 삭제하지 않고 .corrupt-<ts> 로 copy 보존(원본은 그대로 둔다)."""
    ts = time.strftime("%Y%m%d-%H%M%S")
    dst = path.parent / f"{path.name}.corrupt-{ts}"
    try:
        if not dst.exists():
            shutil.copy2(path, dst)
    except Exception:
        logger.warning("corrupt preserve failed for %s", path.name, exc_info=True)


# ─────────────────────────────────────────────
# 원자적 쓰기
# ─────────────────────────────────────────────
def _atomic_write(path: Path, data: list[dict]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    raw = json.dumps(data, ensure_ascii=False, indent=2)
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(raw)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
    # POSIX: rename 내구성까지 확정 (Windows 엔 O_DIRECTORY 없음 → 스킵)
    if hasattr(os, "O_DIRECTORY"):
        try:
            dfd = os.open(str(path.parent) or ".", os.O_DIRECTORY)
            try:
                os.fsync(dfd)
            finally:
                os.close(dfd)
        except OSError:
            pass


# ─────────────────────────────────────────────
# 로드 (자동복구 포함)
# ─────────────────────────────────────────────
def _load_or_recover(path: Path) -> list[dict]:
    """파일 없음 → []. 정상 → 그대로. 손상 → 백업 자동복구, 불가 시 CorruptStoreError.

    호출 전 해당 저장소 락을 보유한 상태여야 한다(복구가 디스크를 수정함).
    """
    if not path.exists():
        return []
    try:
        return _read_file_strict(path)
    except Exception as primary:
        logger.warning("store corrupt: %s (%s) — 백업 복구 시도", path.name, primary)
        _preserve_corrupt(path)
        for bak in _backup_paths(path):
            try:
                data = _read_file_strict(bak)
            except Exception:
                continue
            _atomic_write(path, data)  # 유효 백업으로 canonical 복구
            logger.warning("store recovered from backup %s → %s", bak.name, path.name)
            return data
        raise CorruptStoreError(f"{path.name} 손상 + 유효 백업 없음 ({primary})") from primary


# ─────────────────────────────────────────────
# 공개 API
# ─────────────────────────────────────────────
def read(path: Path) -> list[dict]:
    """읽기 전용 로드(자동복구 포함). 복구 불가 손상 시 CorruptStoreError."""
    with _lock_for(path):
        return _load_or_recover(path)


class _Transaction:
    def __init__(self, path: Path, items: list[dict]):
        self.path = path
        self.items = items

    def commit(self, items: Optional[list[dict]] = None) -> None:
        data = self.items if items is None else items
        _make_backup(self.path)  # 직전 유효본 보존 후
        _atomic_write(self.path, data)  # 원자적 교체


@contextmanager
def transaction(path: Path) -> Iterator[_Transaction]:
    """저장소 락을 잡고 load_or_recover 결과를 제공. txn.commit(items) 로 안전 저장.

    create/update/delete/import/seed 의 읽기-수정-쓰기 전체를 한 락 안에서 직렬화한다.
    """
    with _lock_for(path):
        yield _Transaction(path, _load_or_recover(path))
