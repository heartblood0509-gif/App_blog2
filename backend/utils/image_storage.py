"""
base64로 전달된 이미지 슬롯을 네이버 업로드용 임시 파일로 저장/정리한다.

사용 패턴:
    with tempdir_context(slots) as (tempdir, path_by_slot_id):
        await publisher.publish(..., image_slots=[
            {**slot, "path": str(path_by_slot_id[slot.slot_id])}
            for slot in slots
        ])
    # tempdir 자동 삭제
"""
from __future__ import annotations

import base64
import logging
import shutil
import tempfile
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Sequence


logger = logging.getLogger(__name__)


def _strip_data_url_prefix(b64: str) -> str:
    """data:image/...;base64,XXXX 형태의 접두사를 제거."""
    if "," in b64 and b64.lstrip().startswith("data:"):
        return b64.split(",", 1)[1]
    return b64


def _mime_to_ext(mime: str | None) -> str:
    if not mime:
        return "jpg"
    mime = mime.lower()
    if "png" in mime:
        return "png"
    if "webp" in mime:
        return "webp"
    if "gif" in mime:
        return "gif"
    return "jpg"


def save_slots_to_tempdir(
    slots: Sequence[dict],
) -> tuple[Path, dict[str, Path]]:
    """슬롯들의 base64 이미지를 새 임시 디렉토리에 저장한다.

    Args:
        slots: 각 dict는 최소한 "slot_id", "base64"를 포함. "mime_type" 옵션.

    Returns:
        (tempdir, {slot_id: path}) — path는 image_01.jpg 같은 파일
    """
    tempdir = Path(tempfile.mkdtemp(prefix=f"app_blog2_img_{uuid.uuid4().hex[:8]}_"))
    path_map: dict[str, Path] = {}

    for idx, slot in enumerate(slots, start=1):
        slot_id = slot.get("slot_id")
        b64 = slot.get("base64") or ""
        if not slot_id or not b64:
            continue
        try:
            raw = base64.b64decode(_strip_data_url_prefix(b64))
        except Exception as e:
            logger.warning("이미지 base64 디코딩 실패 (slot_id=%s): %s", slot_id, e)
            continue
        ext = _mime_to_ext(slot.get("mime_type"))
        path = tempdir / f"image_{idx:02d}.{ext}"
        path.write_bytes(raw)
        path_map[slot_id] = path

    return tempdir, path_map


def cleanup_tempdir(tempdir: Path) -> None:
    """임시 디렉토리 안전 삭제. 실패해도 예외는 삼킨다."""
    try:
        if tempdir.exists():
            shutil.rmtree(tempdir, ignore_errors=True)
    except Exception as e:
        logger.warning("임시 디렉토리 정리 실패 (%s): %s", tempdir, e)


@contextmanager
def tempdir_context(
    slots: Sequence[dict],
) -> Iterator[tuple[Path, dict[str, Path]]]:
    """저장+정리 context manager. 발행 성공/실패 둘 다에서 정리 보장."""
    tempdir, path_map = save_slots_to_tempdir(slots)
    try:
        yield tempdir, path_map
    finally:
        cleanup_tempdir(tempdir)
